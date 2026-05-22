import { Events } from "discord.js";
import { botClient } from "./client";
import { initGuildCache, guildCache } from "./cache";

function syncChannelPermissions(guildId: string, channel: {
  id: string;
  permissionOverwrites?: { cache: Map<string, { id: string; allow: { bitfield: bigint }; deny: { bitfield: bigint } }> };
}) {
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
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      });
    }
  }
}

export function setupBotEvents() {
  botClient.once(Events.ClientReady, async (client) => {
    console.log(`Bot logged in as ${client.user?.tag}`);

    for (const [, guild] of client.guilds.cache) {
      const cache = initGuildCache(guild.id);

      for (const [, channel] of guild.channels.cache) {
        cache.channels.set(channel.id, {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
          position: (channel as { position?: number }).position ?? 0,
        });

        syncChannelPermissions(guild.id, channel);
      }

      for (const [, role] of guild.roles.cache) {
        cache.roles.set(role.id, {
          id: role.id,
          name: role.name,
          position: role.position,
          permissions: role.permissions.bitfield.toString(),
          color: role.color,
          memberCount: role.members.size,
        });
      }
    }

    console.log(`Cache initialized for ${guildCache.size} guilds`);
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
    });
  });

  botClient.on(Events.ChannelUpdate, (_oldChannel, newChannel) => {
    if (newChannel.isDMBased()) return;
    const cache = guildCache.get(newChannel.guildId);
    if (!cache) return;

    cache.channels.set(newChannel.id, {
      id: newChannel.id,
      name: newChannel.name,
      type: newChannel.type,
      parentId: newChannel.parentId,
      position: (newChannel as { position?: number }).position ?? 0,
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

    cache.roles.set(role.id, {
      id: role.id,
      name: role.name,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      color: role.color,
      memberCount: role.members.size,
    });
  });

  botClient.on(Events.GuildRoleUpdate, (_oldRole, newRole) => {
    const cache = guildCache.get(newRole.guild.id);
    if (!cache) return;

    cache.roles.set(newRole.id, {
      id: newRole.id,
      name: newRole.name,
      position: newRole.position,
      permissions: newRole.permissions.bitfield.toString(),
      color: newRole.color,
      memberCount: newRole.members.size,
    });
  });

  botClient.on(Events.GuildRoleDelete, (role) => {
    const cache = guildCache.get(role.guild.id);
    if (!cache) return;

    cache.roles.delete(role.id);
  });

  botClient.on(Events.GuildMemberAdd, (member) => {
    const cache = guildCache.get(member.guild.id);
    if (!cache) return;

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

  botClient.on(Events.GuildCreate, (guild) => {
    initGuildCache(guild.id);
  });

  botClient.on(Events.GuildDelete, (guild) => {
    guildCache.delete(guild.id);
  });
}
