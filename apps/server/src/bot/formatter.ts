import {
  DISCORD_PERMISSIONS,
  CHANNEL_TYPES,
} from "@repo/shared";
import {
  guildCache,
  type ChannelCacheEntry,
} from "./cache";
import { botClient } from "./client";

function bitfieldToPermissionNames(bitfield: string): string[] {
  const names: string[] = [];
  try {
    const bits = BigInt(bitfield);
    for (const [name, { bit }] of Object.entries(DISCORD_PERMISSIONS)) {
      if (bits & bit) names.push(name);
    }
  } catch {
    return [];
  }
  return names;
}

function formatPermissions(permissions: string): string {
  const names = bitfieldToPermissionNames(permissions);
  return names.join(", ");
}

function shortenPermissionName(name: string): string {
  return name
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ /g, "");
}

function formatOverwrites(
  channelId: string,
  guildId: string
): string {
  const cache = guildCache.get(guildId);
  if (!cache) return "";

  const overwrites: string[] = [];

  for (const perm of cache.permissions.values()) {
    if (perm.channelId !== channelId) continue;

    const role = cache.roles.get(perm.roleId);
    const roleName = role ? (role.name === "@everyone" ? "@everyone" : `@${role.name}`) : perm.roleId;

    const parts: string[] = [];
    const allowedPerms = bitfieldToPermissionNames(perm.allow);
    const deniedPerms = bitfieldToPermissionNames(perm.deny);

    for (const p of allowedPerms) {
      parts.push(`+${shortenPermissionName(p)}`);
    }
    for (const p of deniedPerms) {
      parts.push(`-${shortenPermissionName(p)}`);
    }

    if (parts.length > 0) {
      overwrites.push(`${roleName}: ${parts.join(",")}`);
    }
  }

  return overwrites.length > 0 ? `, ${overwrites.join(" | ")}` : "";
}

function channelTypeLabel(type: number): string {
  return (CHANNEL_TYPES as Record<number, string>)[type] ?? `type_${type}`;
}

function channelPrefix(type: number): string {
  switch (type) {
    case 2: return "🔊";
    case 13: return "🎤";
    case 15: return "📋";
    case 5: return "📢";
    default: return "#";
  }
}

function formatChannels(guildId: string): string {
  const cache = guildCache.get(guildId);
  if (!cache) return "  (none)\n";

  const categories: ChannelCacheEntry[] = [];
  const children = new Map<string, ChannelCacheEntry[]>();
  const orphans: ChannelCacheEntry[] = [];

  for (const channel of cache.channels.values()) {
    if (channel.type === 4) {
      categories.push(channel);
    } else if (channel.parentId) {
      if (!children.has(channel.parentId)) {
        children.set(channel.parentId, []);
      }
      children.get(channel.parentId)!.push(channel);
    } else {
      orphans.push(channel);
    }
  }

  categories.sort((a, b) => a.position - b.position);

  const lines: string[] = [];

  for (const cat of categories) {
    lines.push(`  ${cat.name}`);
    const subs = (children.get(cat.id) ?? []).sort((a, b) => a.position - b.position);
    for (const sub of subs) {
      const prefix = channelPrefix(sub.type);
      const overwrites = formatOverwrites(sub.id, guildId);
      const msgInfo = sub.messageCount != null ? `, ${sub.messageCount} msgs` : "";
      lines.push(`    ${prefix}${sub.name} — ${channelTypeLabel(sub.type)}${msgInfo}${overwrites}`);
    }
  }

  for (const orphan of orphans.sort((a, b) => a.position - b.position)) {
    const prefix = channelPrefix(orphan.type);
    const overwrites = formatOverwrites(orphan.id, guildId);
    const msgInfo = orphan.messageCount != null ? `, ${orphan.messageCount} msgs` : "";
    lines.push(`  ${prefix}${orphan.name} — ${channelTypeLabel(orphan.type)}${msgInfo}${overwrites}`);
  }

  if (lines.length === 0) {
    lines.push("  (none)");
  }

  return lines.join("\n");
}

function formatRoles(guildId: string): string {
  const cache = guildCache.get(guildId);
  if (!cache) return "  (none)";

  const roles = Array.from(cache.roles.values());
  if (roles.length === 0) return "  (none)";

  const everyoneRole = roles.find((r) => r.name === "@everyone");
  const sortedRoles = [
    ...roles
      .filter((r) => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position),
  ];

  const lines: string[] = [];

  for (const role of sortedRoles) {
    const permStr = formatPermissions(role.permissions);
    const memberStr = role.memberCount != null ? `${role.memberCount} members` : "";
    const parts = [memberStr, `pos:${role.position}`, permStr].filter(Boolean);
    lines.push(`  ${role.name} — ${parts.join(", ")}`);
  }

  if (everyoneRole) {
    const permStr = formatPermissions(everyoneRole.permissions);
    const memberStr = everyoneRole.memberCount != null ? `${everyoneRole.memberCount} members` : "";
    const parts = [memberStr, `pos:${everyoneRole.position}`, permStr].filter(Boolean);
    lines.push(`  @everyone — ${parts.join(", ")}`);
  }

  return lines.join("\n");
}

export function formatGuildForLLM(
  guildId: string,
  guildName?: string,
  memberCount?: number
): string {
  const guild = botClient.guilds.cache.get(guildId);
  const name = guildName ?? guild?.name ?? guildId;
  const members = memberCount ?? guild?.memberCount ?? 0;

  const lines: string[] = [];
  lines.push(`Server: ${name} (${members} members)`);
  lines.push("");
  lines.push("Categories:");
  lines.push(formatChannels(guildId));
  lines.push("");
  lines.push("Roles:");
  lines.push(formatRoles(guildId));

  return lines.join("\n");
}
