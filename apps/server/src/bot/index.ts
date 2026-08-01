import { Events } from "discord.js";
import { eq } from "drizzle-orm";
import { db, driftEvents, guilds } from "@repo/db";
import { bitfieldToPermissionNames } from "@repo/shared";
import { guildCache, initGuildCache } from "./cache";
import { botClient } from "./client";
import { botHasAdministrator } from "./permissions";
import { emitDriftEvent } from "../planning/drift-detector";
import { isGuildLocked } from "../planning/locking";
import { logger } from "../utils/logger";
import type { DriftEvent } from "../planning/drift-detector";

/**
 * Resolves after the first ClientReady event finishes rebuilding the
 * guild cache. Awaited at boot so the Hono server never accepts a
 * request that would read from a partially-built cache.
 */
let botReadyResolve: (() => void) | null = null;
export const botReady = new Promise<void>((resolve) => {
  botReadyResolve = resolve;
});

export function resolveBotReady() {
  if (botReadyResolve) {
    botReadyResolve();
    botReadyResolve = null;
  }
}

function buildRoleCacheEntry(
  role: {
    id: string;
    name: string;
    position: number;
    permissions: { bitfield: bigint };
    color: number;
    hoist: boolean;
    mentionable: boolean;
    members: { size: number };
    tags?: {
      botId?: string;
      integrationId?: string;
      premiumSubscriberRole?: true;
      subscriptionListingId?: string;
      availableForPurchase?: true;
      guildConnections?: true;
    } | null;
  },
  guild: { members: { cache: Map<string, { user?: { username: string } }> } }
) {
  const botUser = role.tags?.botId ? guild.members.cache.get(role.tags.botId)?.user : undefined;

  return {
    id: role.id,
    name: role.name,
    position: role.position,
    permissions: bitfieldToPermissionNames(role.permissions.bitfield.toString()),
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    memberCount: role.members.size,
    tags: role.tags
      ? {
          botId: role.tags.botId,
          botName: botUser?.username,
          integrationId: role.tags.integrationId,
          premiumSubscriber: role.tags.premiumSubscriberRole ? null : undefined,
          subscriptionListingId: role.tags.subscriptionListingId,
          availableForPurchase: role.tags.availableForPurchase ? null : undefined,
          guildConnections: role.tags.guildConnections ? null : undefined,
        }
      : undefined,
  };
}

function syncChannelPermissions(
  guildId: string,
  channel: {
    id: string;
    permissionOverwrites?: {
      cache: Map<string, { id: string; allow: { bitfield: bigint }; deny: { bitfield: bigint } }>;
    };
  }
) {
  const cache = guildCache.get(guildId);
  if (!cache) return;

  for (const key of cache.permissions.keys()) {
    if (key.startsWith(`${channel.id}:`)) {
      cache.permissions.delete(key);
    }
  }

  if (channel.permissionOverwrites) {
    for (const [, overwrite] of channel.permissionOverwrites.cache) {
      const key = `${channel.id}:${overwrite.id}`;
      cache.permissions.set(key, {
        channelId: channel.id,
        roleId: overwrite.id,
        allow: bitfieldToPermissionNames(overwrite.allow.bitfield.toString()),
        deny: bitfieldToPermissionNames(overwrite.deny.bitfield.toString()),
      });
    }
  }
}

async function reportGatewayDrift(event: DriftEvent): Promise<void> {
  try {
    // Gateway events caused by the active execution are expected convergence,
    // not external drift. The execution route holds this lock until its final
    // state capture and bookkeeping complete.
    if (await isGuildLocked(event.guildId)) return;

    emitDriftEvent(event);
    await db.insert(driftEvents).values({
      guildId: event.guildId,
      severity: event.severity,
      kind: event.kind,
      summary: event.summary,
      details: event.details,
    });
  } catch (err) {
    logger.error(err, "[bot] failed to publish gateway drift event");
  }
}

export function setupBotEvents() {
  const rebuildCache = async (client: typeof botClient) => {
    const adminMissing: string[] = [];

    for (const [, guild] of client.guilds.cache) {
      const cache = initGuildCache(guild.id);

      for (const [, channel] of guild.channels.cache) {
        cache.channels.set(channel.id, {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: (channel as { position?: number }).position ?? 0,
          lockPermissions:
            (channel as unknown as { permissionsLocked?: boolean | null }).permissionsLocked ??
            undefined,
        });

        syncChannelPermissions(guild.id, channel);
      }

      for (const [, role] of guild.roles.cache) {
        cache.roles.set(role.id, buildRoleCacheEntry(role, guild));
      }

      if (!botHasAdministrator(guild.id)) {
        adminMissing.push(guild.name);
      }
    }

    logger.info(`Cache initialized for ${guildCache.size} guilds`);

    if (adminMissing.length > 0) {
      logger.warn(
        `[SECURITY] Bot lacks ADMINISTRATOR in ${adminMissing.length} guild(s): ${adminMissing.join(", ")}. ` +
          "All planning and execution operations are blocked for these guilds."
      );
    }
  };

  const onReady = (client: typeof botClient) => {
    logger.info(`Bot logged in as ${client.user?.tag}`);
    rebuildCache(client)
      .then(() => {
        resolveBotReady();
      })
      .catch((err) => {
        logger.error(err, "[bot] cache rebuild failed");
      });
  };

  // Register .on (not .once) so a full session resume after disconnect
  // also repopulates the cache. The first event still fires once; no need
  // for a separate .once handler.
  botClient.on(Events.ClientReady, onReady);

  // Discord.js emits Events.Error for shard/network issues. Without a
  // listener, an unhandled error event on the EventEmitter crashes the
  // process. Route to the logger instead.
  botClient.on(Events.Error, (err) => {
    logger.error(err, "[bot] discord client error");
  });

  botClient.on(Events.ChannelCreate, (channel) => {
    const cache = guildCache.get(channel.guildId);
    if (!cache) return;

    cache.channels.set(channel.id, {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: (channel as { position?: number }).position ?? 0,
      lockPermissions: channel.permissionsLocked ?? undefined,
    });
    syncChannelPermissions(channel.guildId, channel);

    void reportGatewayDrift({
      guildId: channel.guildId,
      severity: "warning",
      kind: "channel_created",
      summary: `Channel "${channel.name}" was created directly in Discord.`,
      details: { channelId: channel.id, name: channel.name, type: channel.type },
      detectedAt: new Date().toISOString(),
    });
  });

  botClient.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    if (newChannel.isDMBased()) return;
    const cache = guildCache.get(newChannel.guildId);
    if (!cache) return;

    cache.channels.set(newChannel.id, {
      id: newChannel.id,
      name: newChannel.name,
      type: newChannel.type,
      parentId: newChannel.parentId,
      position: (newChannel as { position?: number }).position ?? 0,
      lockPermissions: newChannel.permissionsLocked ?? undefined,
    });

    syncChannelPermissions(newChannel.guildId, newChannel);

    const old = oldChannel as {
      name: string;
      parentId: string | null;
      position?: number;
    };
    const changedFields = [
      ...(old.name !== newChannel.name ? ["name"] : []),
      ...(old.parentId !== newChannel.parentId ? ["parentId"] : []),
      ...(old.position !== newChannel.position ? ["position"] : []),
    ];

    if (changedFields.length > 0) {
      void reportGatewayDrift({
        guildId: newChannel.guildId,
        severity: "warning",
        kind: "channel_updated",
        summary: `Channel "${newChannel.name}" changed directly in Discord.`,
        details: { channelId: newChannel.id, fields: changedFields },
        detectedAt: new Date().toISOString(),
      });
    }
  });

  botClient.on(Events.ChannelDelete, (channel) => {
    if (channel.isDMBased()) return;
    const cache = guildCache.get(channel.guildId);
    if (cache) {
      cache.channels.delete(channel.id);
      for (const key of cache.permissions.keys()) {
        if (key.startsWith(`${channel.id}:`)) {
          cache.permissions.delete(key);
        }
      }
    }

    void reportGatewayDrift({
      guildId: channel.guildId,
      severity: "warning",
      kind: "channel_deleted",
      summary: `Channel "${channel.name}" was deleted directly in Discord.`,
      details: { channelId: channel.id, name: channel.name, type: channel.type },
      detectedAt: new Date().toISOString(),
    });
  });

  botClient.on(Events.GuildRoleCreate, (role) => {
    const cache = guildCache.get(role.guild.id);
    if (!cache) return;

    cache.roles.set(role.id, buildRoleCacheEntry(role, role.guild));

    void reportGatewayDrift({
      guildId: role.guild.id,
      severity: "warning",
      kind: "role_created",
      summary: `Role "${role.name}" was created directly in Discord.`,
      details: { roleId: role.id, name: role.name, position: role.position },
      detectedAt: new Date().toISOString(),
    });
  });

  botClient.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
    const cache = guildCache.get(newRole.guild.id);
    if (!cache) return;

    cache.roles.set(newRole.id, buildRoleCacheEntry(newRole, newRole.guild));

    const changedFields = [
      ...(oldRole.name !== newRole.name ? ["name"] : []),
      ...(oldRole.position !== newRole.position ? ["position"] : []),
      ...(oldRole.permissions.bitfield !== newRole.permissions.bitfield ? ["permissions"] : []),
    ];

    if (changedFields.length > 0) {
      void reportGatewayDrift({
        guildId: newRole.guild.id,
        severity: "warning",
        kind: "role_updated",
        summary: `Role "${newRole.name}" changed directly in Discord.`,
        details: { roleId: newRole.id, fields: changedFields },
        detectedAt: new Date().toISOString(),
      });
    }
  });

  botClient.on(Events.GuildRoleDelete, (role) => {
    const cache = guildCache.get(role.guild.id);
    if (!cache) return;

    cache.roles.delete(role.id);

    void reportGatewayDrift({
      guildId: role.guild.id,
      severity: "warning",
      kind: "role_deleted",
      summary: `Role "${role.name}" was deleted directly in Discord.`,
      details: { roleId: role.id, name: role.name, position: role.position },
      detectedAt: new Date().toISOString(),
    });
  });

  botClient.on(Events.GuildMemberAdd, (member) => {
    const cache = guildCache.get(member.guild.id);
    if (!cache) return;

    cache.members.set(member.id, {
      id: member.id,
      username: member.user.username,
      roleIds: Array.from(member.roles.cache.keys()),
    });

    for (const roleId of member.roles.cache.keys()) {
      const entry = cache.roles.get(roleId);
      if (entry) {
        entry.memberCount = (entry.memberCount ?? 0) + 1;
      }
    }
  });

  botClient.on(Events.GuildMemberRemove, (member) => {
    const cache = guildCache.get(member.guild.id);
    if (!cache) return;

    cache.members.delete(member.id);

    for (const roleId of member.roles.cache.keys()) {
      const entry = cache.roles.get(roleId);
      if (entry && entry.memberCount) {
        entry.memberCount = Math.max(0, entry.memberCount - 1);
      }
    }
  });

  botClient.on(Events.GuildMemberUpdate, (_oldMember, newMember) => {
    const cache = guildCache.get(newMember.guild.id);
    if (!cache) return;

    // Update member cache with current roles
    cache.members.set(newMember.id, {
      id: newMember.id,
      username: newMember.user.username,
      roleIds: Array.from(newMember.roles.cache.keys()),
    });

    const oldRoles = new Set(_oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    for (const roleId of oldRoles) {
      if (!newRoles.has(roleId)) {
        const entry = cache.roles.get(roleId);
        if (entry && entry.memberCount) {
          entry.memberCount = Math.max(0, entry.memberCount - 1);
        }
      }
    }

    for (const roleId of newRoles) {
      if (!oldRoles.has(roleId)) {
        const entry = cache.roles.get(roleId);
        if (entry) {
          entry.memberCount = (entry.memberCount ?? 0) + 1;
        }
      }
    }

    const addedRoleIds = [...newRoles].filter((roleId) => !oldRoles.has(roleId));
    const removedRoleIds = [...oldRoles].filter((roleId) => !newRoles.has(roleId));
    if (addedRoleIds.length > 0 || removedRoleIds.length > 0) {
      void reportGatewayDrift({
        guildId: newMember.guild.id,
        severity: "warning",
        kind: "member_roles_updated",
        summary: `Roles for member "${newMember.user.username}" changed directly in Discord.`,
        details: { memberId: newMember.id, addedRoleIds, removedRoleIds },
        detectedAt: new Date().toISOString(),
      });
    }
  });

  botClient.on(Events.GuildCreate, async (guild) => {
    initGuildCache(guild.id);

    if (!botHasAdministrator(guild.id)) {
      logger.warn(
        `[SECURITY] Bot joined guild "${guild.name}" (${guild.id}) without ADMINISTRATOR permission. ` +
          "All planning and execution operations are blocked for this guild."
      );
    }

    // Upsert guild row in database
    const [existing] = await db.select().from(guilds).where(eq(guilds.id, guild.id));

    if (!existing) {
      await db.insert(guilds).values({
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL(),
      });
    } else {
      await db.update(guilds).set({ name: guild.name }).where(eq(guilds.id, guild.id));
    }

    const cache = guildCache.get(guild.id);
    if (cache) {
      for (const [, channel] of guild.channels.cache) {
        cache.channels.set(channel.id, {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: (channel as { position?: number }).position ?? 0,
          lockPermissions:
            (channel as unknown as { permissionsLocked?: boolean | null }).permissionsLocked ??
            undefined,
        });
        syncChannelPermissions(guild.id, channel);
      }

      // Initialize members cache (up to 1000 members)
      try {
        const members = await guild.members.fetch();
        for (const [, member] of members) {
          cache.members.set(member.id, {
            id: member.id,
            username: member.user.username,
            roleIds: Array.from(member.roles.cache.keys()),
          });
        }
      } catch {
        // Member fetch may fail for large guilds without proper intents
      }
    }
  });

  botClient.on(Events.GuildDelete, (guild) => {
    guildCache.delete(guild.id);
  });
}
