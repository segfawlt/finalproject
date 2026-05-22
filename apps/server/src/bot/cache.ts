export interface ChannelCacheEntry {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  messageCount?: number;
}

export interface RoleCacheEntry {
  id: string;
  name: string;
  position: number;
  permissions: string;
  color: number;
  memberCount?: number;
}

export interface PermissionCacheEntry {
  channelId: string;
  roleId: string;
  allow: string;
  deny: string;
}

export const guildCache = new Map<
  string,
  {
    channels: Map<string, ChannelCacheEntry>;
    roles: Map<string, RoleCacheEntry>;
    permissions: Map<string, PermissionCacheEntry>;
  }
>();

export function initGuildCache(guildId: string) {
  if (!guildCache.has(guildId)) {
    guildCache.set(guildId, {
      channels: new Map(),
      roles: new Map(),
      permissions: new Map(),
    });
  }
  return guildCache.get(guildId)!;
}

export function getGuildCache(guildId: string) {
  return guildCache.get(guildId);
}

export function getChannelByName(
  guildId: string,
  name: string
): ChannelCacheEntry | undefined {
  const cache = guildCache.get(guildId);
  if (!cache) return undefined;
  for (const channel of cache.channels.values()) {
    if (channel.name === name) return channel;
  }
  return undefined;
}

export function getChannelsByParent(
  guildId: string,
  parentId: string
): ChannelCacheEntry[] {
  const cache = guildCache.get(guildId);
  if (!cache) return [];
  const result: ChannelCacheEntry[] = [];
  for (const channel of cache.channels.values()) {
    if (channel.parentId === parentId) result.push(channel);
  }
  return result;
}

export function getChildrenCount(
  guildId: string,
  parentId: string
): number {
  return getChannelsByParent(guildId, parentId).length;
}

export function getRoleByName(
  guildId: string,
  name: string
): RoleCacheEntry | undefined {
  const cache = guildCache.get(guildId);
  if (!cache) return undefined;
  for (const role of cache.roles.values()) {
    if (role.name === name) return role;
  }
  return undefined;
}

export function getChannelsByType(
  guildId: string,
  type: number
): ChannelCacheEntry[] {
  const cache = guildCache.get(guildId);
  if (!cache) return [];
  const result: ChannelCacheEntry[] = [];
  for (const channel of cache.channels.values()) {
    if (channel.type === type) result.push(channel);
  }
  return result;
}
