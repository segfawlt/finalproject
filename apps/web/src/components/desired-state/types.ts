/**
 * Local type definitions for the DesiredState tree rendered by the Studio.
 *
 * The shapes match `packages/shared/src/types.ts` (DesiredState / ChannelBase /
 * Role / MemberRoleAssignment / Tombstone). We duplicate them here so the web
 * app can render without a hard dependency on @repo/shared. When the web app
 * adopts @repo/shared, these local definitions can be replaced with `import
 * type { ... } from "@repo/shared"` without changing the component APIs.
 */

export interface ForumTag {
  name: string;
  moderated?: boolean;
  emojiId?: string | null;
  emojiName?: string | null;
}

export interface PermissionOverwrite {
  channelId: string;
  roleId: string;
  allow: string[];
  deny: string[];
}

export interface ChannelBase {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  topic?: string | null;
  nsfw?: boolean;
  bitrate?: number;
  userLimit?: number;
  rateLimitPerUser?: number;
  lockPermissions?: boolean;
  availableTags?: ForumTag[];
  defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
  defaultSortOrder?: number | null;
  defaultForumLayout?: number;
  defaultThreadRateLimitPerUser?: number;
  flags?: number;
}

export interface Role {
  id: string;
  name: string;
  position: number;
  permissions: string[];
  color: number;
  hoist: boolean;
  mentionable: boolean;
}

export interface MemberRoleAssignment {
  memberId: string;
  roleIds: string[];
}

export interface Tombstone {
  discordId: string;
  resourceType: "channel" | "role" | "category";
  name: string;
  deletedInVersion: number;
}

export interface DesiredState {
  guildId: string;
  guildName: string;
  active: {
    channels: Record<string, ChannelBase>;
    roles: Record<string, Role>;
    overwrites: Record<string, PermissionOverwrite>;
    memberRoles?: Record<string, MemberRoleAssignment>;
  };
  tombstones: Tombstone[];
  symbolCounter: number;
  version: number;
}

/**
 * Local copy of the server's ServerState response shape. Used for the
 * "current vs desired" diff in DesiredStateView. Mirrors
 * `packages/shared/src/types.ts:ServerState`; web app has no dep on @repo/shared.
 */
export interface ServerState {
  guildId: string;
  guildName: string;
  memberCount: number;
  channels: ChannelBase[];
  roles: Role[];
  overwrites: PermissionOverwrite[];
  memberRoles?: MemberRoleAssignment[];
}

/**
 * Status of a single item when the desired state is compared to the current
 * Discord state. The view component reads this to render colored badges.
 */
export type DiffStatus = "new" | "modified" | "unchanged" | "removed";

/** Discord channel type 4 = GuildCategory. Categories are modeled as channels. */
export const CATEGORY_TYPE = 4;

/** Human-readable label for a channel type number. Falls back to `#${type}`. */
export function channelTypeLabel(type: number): string {
  switch (type) {
    case 0:
      return "text";
    case 2:
      return "voice";
    case 4:
      return "category";
    case 5:
      return "announcement";
    case 13:
      return "stage";
    case 15:
      return "forum";
    case 16:
      return "media";
    default:
      return `#${type}`;
  }
}

/** Format a Discord role color integer (24-bit RGB) as `#rrggbb`. Zero = no color. */
export function roleColorHex(color: number): string {
  if (!color) return "—";
  return `#${color.toString(16).padStart(6, "0")}`;
}
