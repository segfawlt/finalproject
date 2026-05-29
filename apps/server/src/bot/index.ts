import { Events } from "discord.js";
import { botClient } from "./client";
import { initGuildCache, guildCache } from "./cache";
import { botHasAdministrator } from "./permissions";
import { bitfieldToPermissionNames } from "@repo/shared";
import { db, guilds } from "@repo/db";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

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
  const botUser = role.tags?.botId
    ? guild.members.cache.get(role.tags.botId)?.user
    : undefined;

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

export function setupBotEvents() {
  botClient.once(Events.ClientReady, async (client) => {
    logger.info(`Bot logged in as ${client.user?.tag}`);

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
          messageCount: 0,
          lockPermissions: (channel as unknown as { permissionsLocked?: boolean | null }).permissionsLocked ?? undefined,
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
      // NOTE: messageCount starts at 0 because Discord does not expose a
      // historical message count API. The count only includes messages
      // observed while the bot is running. This is a known Phase 1
      // limitation — the count is approximate and understated.
      messageCount: 0,
      lockPermissions: channel.permissionsLocked ?? undefined,
    });
  });

  botClient.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
    if (newChannel.isDMBased()) return;
    const cache = guildCache.get(newChannel.guildId);
    if (!cache) return;

    const existing = cache.channels.get(newChannel.id);
    cache.channels.set(newChannel.id, {
      id: newChannel.id,
      name: newChannel.name,
      type: newChannel.type,
      parentId: newChannel.parentId,
      position: (newChannel as { position?: number }).position ?? 0,
      messageCount: existing?.messageCount ?? 0,
      lockPermissions: newChannel.permissionsLocked ?? undefined,
    });

    syncChannelPermissions(newChannel.guildId, newChannel);
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
  });

  botClient.on(Events.GuildRoleCreate, (role) => {
    const cache = guildCache.get(role.guild.id);
    if (!cache) return;

    cache.roles.set(role.id, buildRoleCacheEntry(role, role.guild));
  });

  botClient.on(Events.GuildRoleUpdate, (_oldRole, newRole) => {
    const cache = guildCache.get(newRole.guild.id);
    if (!cache) return;

    cache.roles.set(newRole.id, buildRoleCacheEntry(newRole, newRole.guild));
  });

  botClient.on(Events.GuildRoleDelete, (role) => {
    const cache = guildCache.get(role.guild.id);
    if (!cache) return;

    cache.roles.delete(role.id);
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
  });

  botClient.on(Events.MessageCreate, (message) => {
    if (message.guildId) {
      const cache = guildCache.get(message.guildId);
      if (cache) {
        const entry = cache.channels.get(message.channelId);
        if (entry) {
          entry.messageCount = (entry.messageCount ?? 0) + 1;
        }
      }
    }
  });

  botClient.on(Events.MessageDelete, (message) => {
    if (message.guildId) {
      const cache = guildCache.get(message.guildId);
      if (cache) {
        const entry = cache.channels.get(message.channelId);
        if (entry) {
          entry.messageCount = Math.max(0, (entry.messageCount ?? 0) - 1);
        }
      }
    }
  });

  botClient.on(Events.MessageBulkDelete, (messages) => {
    const first = messages.first();
    if (!first?.guildId) return;
    const cache = guildCache.get(first.guildId);
    if (!cache) return;
    const entry = cache.channels.get(first.channelId);
    if (entry) {
      entry.messageCount = Math.max(0, (entry.messageCount ?? 0) - messages.size);
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

    // Initialize channels with messageCount: 0
    const cache = guildCache.get(guild.id);
    if (cache) {
      for (const [, channel] of guild.channels.cache) {
        cache.channels.set(channel.id, {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: (channel as { position?: number }).position ?? 0,
          messageCount: 0,
          lockPermissions: (channel as unknown as { permissionsLocked?: boolean | null }).permissionsLocked ?? undefined,
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
