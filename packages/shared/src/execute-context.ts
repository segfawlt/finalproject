export interface CreateChannelResult {
  id: string;
}

export interface CreateRoleResult {
  id: string;
}

/**
 * Abstraction over the Discord.js REST API for tool execution.
 *
 * One instance wraps a single Discord guild (identified by `guildId`).
 * The implementation lives in `apps/server/` and uses `botClient`.
 *
 * Error contract: All methods throw on Discord API failure.
 * Error classification (transient vs permanent), retry with backoff,
 * and rollback are the execution engine's responsibility — not this layer's.
 * ExecuteContext is stateless. It does not track what was created or deleted.
 */
export interface ExecuteContext {
  readonly guildId: string;

  // Channel operations
  createChannel(
    name: string,
    type: number,
    options?: {
      parentId?: string;
      position?: number;
      topic?: string;
      bitrate?: number;
      userLimit?: number;
      nsfw?: boolean;
      rateLimitPerUser?: number;
      availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
      defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
      defaultSortOrder?: number | null;
      defaultForumLayout?: number;
      defaultThreadRateLimitPerUser?: number;
      flags?: number;
      lockPermissions?: boolean;
    }
  ): Promise<CreateChannelResult>;

  editChannel(
    id: string,
    options: {
      name?: string;
      type?: number;
      parentId?: string;
      position?: number;
      topic?: string;
      bitrate?: number;
      userLimit?: number;
      nsfw?: boolean;
      rateLimitPerUser?: number;
      availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
      defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
      defaultSortOrder?: number | null;
      defaultForumLayout?: number;
      defaultThreadRateLimitPerUser?: number;
      flags?: number;
      lockPermissions?: boolean;
    }
  ): Promise<void>;

  deleteChannel(id: string): Promise<void>;

  moveChannel(
    id: string,
    options: {
      parentId?: string;
      position?: number;
      lockPermissions?: boolean;
    }
  ): Promise<void>;

  // Role operations
  createRole(
    name: string,
    options?: {
      permissions?: string[];
      color?: number;
      hoist?: boolean;
      mentionable?: boolean;
      position?: number;
    }
  ): Promise<CreateRoleResult>;

  editRole(
    id: string,
    options: {
      name?: string;
      permissions?: string[];
      color?: number;
      hoist?: boolean;
      mentionable?: boolean;
      position?: number;
    }
  ): Promise<void>;

  deleteRole(id: string): Promise<void>;

  moveRole(id: string, position: number): Promise<void>;

  // Permission operations
  setOverwrite(
    channelId: string,
    roleId: string,
    options: {
      allow?: string[];
      deny?: string[];
    }
  ): Promise<void>;

  removeOverwrite(channelId: string, roleId: string): Promise<void>;

  // Member operations
  addRoleToMember(memberId: string, roleId: string): Promise<void>;

  removeRoleFromMember(memberId: string, roleId: string): Promise<void>;
}
