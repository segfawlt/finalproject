import { PermissionFlagsBits, type Guild, type CategoryChannel, ChannelType } from "discord.js";
import type { ExecuteContext, CreateChannelResult, CreateRoleResult } from "@repo/shared";
import { toPascalCase } from "@repo/shared";
import { logger } from "../utils/logger";

export class DiscordExecuteContext implements ExecuteContext {
  readonly guildId: string;
  private guild: Guild;

  constructor(guild: Guild) {
    this.guild = guild;
    this.guildId = guild.id;
  }

  // ── Channel operations ─────────────────────────────────────────────────────

  async createChannel(
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
      availableTags?: Array<{
        name: string;
        moderated?: boolean;
        emojiId?: string | null;
        emojiName?: string | null;
      }>;
      defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
      defaultSortOrder?: number | null;
      defaultForumLayout?: number;
      defaultThreadRateLimitPerUser?: number;
      flags?: number;
      lockPermissions?: boolean;
    }
  ): Promise<CreateChannelResult> {
    const parent = options?.parentId
      ? (this.guild.channels.cache.get(options.parentId) as CategoryChannel | undefined)
      : undefined;

    const availableTags = options?.availableTags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emoji:
        tag.emojiId || tag.emojiName
          ? { id: tag.emojiId ?? null, name: tag.emojiName ?? null }
          : null,
    }));

    const defaultReactionEmoji = options?.defaultReactionEmoji
      ? {
          id: options.defaultReactionEmoji.emojiId ?? null,
          name: options.defaultReactionEmoji.emojiName ?? null,
        }
      : undefined;

    const channel = await this.guild.channels.create({
      name,
      type,
      parent: parent?.id ?? undefined,
      position: options?.position,
      topic: options?.topic,
      bitrate: options?.bitrate,
      userLimit: options?.userLimit,
      nsfw: options?.nsfw,
      rateLimitPerUser: options?.rateLimitPerUser,
      availableTags,
      defaultReactionEmoji,
      defaultSortOrder: options?.defaultSortOrder ?? undefined,
      defaultForumLayout: options?.defaultForumLayout ?? undefined,
      defaultThreadRateLimitPerUser: options?.defaultThreadRateLimitPerUser,
      ...(options?.flags !== undefined ? { flags: options.flags } : {}),
      lockPermissions: options?.lockPermissions,
    } as any);

    logger.debug(
      { guildId: this.guildId, name, type, id: (channel as { id: string }).id },
      "[discord] channel created"
    );

    return { id: (channel as { id: string }).id };
  }

  async editChannel(
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
      availableTags?: Array<{
        name: string;
        moderated?: boolean;
        emojiId?: string | null;
        emojiName?: string | null;
      }>;
      defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
      defaultSortOrder?: number | null;
      defaultForumLayout?: number;
      defaultThreadRateLimitPerUser?: number;
      flags?: number;
      lockPermissions?: boolean;
    }
  ): Promise<void> {
    const channel = this.guild.channels.cache.get(id);
    if (!channel) throw new Error(`Channel ${id} not found`);
    if (
      !channel.isTextBased() &&
      !channel.isVoiceBased() &&
      channel.type !== ChannelType.GuildCategory
    ) {
      throw new Error(`Channel ${id} is not editable`);
    }

    const parent = options.parentId
      ? (this.guild.channels.cache.get(options.parentId) as CategoryChannel | undefined)
      : undefined;

    const availableTags = options.availableTags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emoji:
        tag.emojiId || tag.emojiName
          ? { id: tag.emojiId ?? null, name: tag.emojiName ?? null }
          : null,
    }));

    const defaultReactionEmoji = options.defaultReactionEmoji
      ? {
          id: options.defaultReactionEmoji.emojiId ?? null,
          name: options.defaultReactionEmoji.emojiName ?? null,
        }
      : undefined;

    const editOptions: Record<string, unknown> = {};
    if (options.name !== undefined) editOptions.name = options.name;
    if (parent?.id !== undefined) editOptions.parent = parent.id;
    if (options.position !== undefined) editOptions.position = options.position;
    if (options.topic !== undefined) editOptions.topic = options.topic;
    if (options.bitrate !== undefined) editOptions.bitrate = options.bitrate;
    if (options.userLimit !== undefined) editOptions.userLimit = options.userLimit;
    if (options.nsfw !== undefined) editOptions.nsfw = options.nsfw;
    if (options.rateLimitPerUser !== undefined) {
      editOptions.rateLimitPerUser = options.rateLimitPerUser;
    }
    if (availableTags !== undefined) editOptions.availableTags = availableTags;
    if (defaultReactionEmoji !== undefined) editOptions.defaultReactionEmoji = defaultReactionEmoji;
    if (options.defaultSortOrder !== undefined) {
      editOptions.defaultSortOrder = options.defaultSortOrder;
    }
    if (options.defaultForumLayout !== undefined) {
      editOptions.defaultForumLayout = options.defaultForumLayout;
    }
    if (options.defaultThreadRateLimitPerUser !== undefined) {
      editOptions.defaultThreadRateLimitPerUser = options.defaultThreadRateLimitPerUser;
    }
    if (options.flags !== undefined) editOptions.flags = options.flags;
    if (options.lockPermissions !== undefined) {
      editOptions.lockPermissions = options.lockPermissions;
    }

    await channel.edit(editOptions);

    logger.debug({ guildId: this.guildId, id, name: options.name }, "[discord] channel edited");
  }

  async deleteChannel(id: string): Promise<void> {
    const channel = this.guild.channels.cache.get(id);
    if (!channel) throw new Error(`Channel ${id} not found`);
    await channel.delete();
    logger.debug({ guildId: this.guildId, id, name: channel.name }, "[discord] channel deleted");
  }

  async moveChannel(
    id: string,
    options: {
      parentId?: string;
      position?: number;
      lockPermissions?: boolean;
    }
  ): Promise<void> {
    const channel = this.guild.channels.cache.get(id);
    if (!channel) throw new Error(`Channel ${id} not found`);

    const parent = options.parentId
      ? (this.guild.channels.cache.get(options.parentId) as CategoryChannel | undefined)
      : undefined;

    const editOptions: Record<string, unknown> = {};
    if (parent?.id !== undefined) editOptions.parent = parent.id;
    if (options.position !== undefined) editOptions.position = options.position;
    if (options.lockPermissions !== undefined)
      editOptions.lockPermissions = options.lockPermissions;

    await channel.edit(editOptions);

    logger.debug(
      { guildId: this.guildId, id, parentId: options.parentId, position: options.position },
      "[discord] channel moved"
    );
  }

  // ── Role operations ────────────────────────────────────────────────────────

  async createRole(
    name: string,
    options?: {
      permissions?: string[];
      color?: number;
      hoist?: boolean;
      mentionable?: boolean;
      position?: number;
    }
  ): Promise<CreateRoleResult> {
    const createOptions: Record<string, unknown> = { name };
    if (options?.permissions !== undefined) {
      createOptions.permissions = this.parsePermissions(options.permissions);
    }
    if (options?.color !== undefined) createOptions.color = options.color;
    if (options?.hoist !== undefined) createOptions.hoist = options.hoist;
    if (options?.mentionable !== undefined) createOptions.mentionable = options.mentionable;
    if (options?.position !== undefined) createOptions.position = options.position;

    const role = await this.guild.roles.create(createOptions);

    logger.debug({ guildId: this.guildId, name, id: role.id }, "[discord] role created");

    return { id: role.id };
  }

  async editRole(
    id: string,
    options: {
      name?: string;
      permissions?: string[];
      color?: number;
      hoist?: boolean;
      mentionable?: boolean;
      position?: number;
    }
  ): Promise<void> {
    const role = this.guild.roles.cache.get(id);
    if (!role) throw new Error(`Role ${id} not found`);

    const editOptions: Record<string, unknown> = {};
    if (options.name !== undefined) editOptions.name = options.name;
    if (options.permissions !== undefined) {
      editOptions.permissions = this.parsePermissions(options.permissions);
    }
    if (options.color !== undefined) editOptions.color = options.color;
    if (options.hoist !== undefined) editOptions.hoist = options.hoist;
    if (options.mentionable !== undefined) editOptions.mentionable = options.mentionable;
    if (options.position !== undefined) editOptions.position = options.position;

    await role.edit(editOptions);

    logger.debug({ guildId: this.guildId, id, name: options.name }, "[discord] role edited");
  }

  async deleteRole(id: string): Promise<void> {
    const role = this.guild.roles.cache.get(id);
    if (!role) throw new Error(`Role ${id} not found`);
    await role.delete();
    logger.debug({ guildId: this.guildId, id, name: role.name }, "[discord] role deleted");
  }

  async moveRole(id: string, position: number): Promise<void> {
    const role = this.guild.roles.cache.get(id);
    if (!role) throw new Error(`Role ${id} not found`);
    await role.setPosition(position);
    logger.debug({ guildId: this.guildId, id, name: role.name, position }, "[discord] role moved");
  }

  // ── Permission operations ────────────────────────────────────────────────────

  async setOverwrite(
    channelId: string,
    roleId: string,
    options: {
      allow?: string[];
      deny?: string[];
    }
  ): Promise<void> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    if (
      !channel.isTextBased() &&
      !channel.isVoiceBased() &&
      channel.type !== ChannelType.GuildCategory
    ) {
      throw new Error(`Channel ${channelId} does not support permission overwrites`);
    }

    const allow = options.allow ? this.parsePermissions(options.allow) : undefined;
    const deny = options.deny ? this.parsePermissions(options.deny) : undefined;

    const ch = channel as unknown as {
      permissionOverwrites: { edit: (target: unknown, opts: unknown) => Promise<void> };
    };

    if (roleId === this.guild.roles.everyone.id) {
      await ch.permissionOverwrites.edit(this.guild.roles.everyone, { allow, deny });
    } else {
      const role = this.guild.roles.cache.get(roleId);
      if (!role) throw new Error(`Role ${roleId} not found`);
      await ch.permissionOverwrites.edit(role, { allow, deny });
    }

    logger.debug(
      { guildId: this.guildId, channelId, roleId, allow, deny },
      "[discord] overwrite set"
    );
  }

  async removeOverwrite(channelId: string, roleId: string): Promise<void> {
    const channel = this.guild.channels.cache.get(channelId);
    if (!channel) throw new Error(`Channel ${channelId} not found`);
    if (
      !channel.isTextBased() &&
      !channel.isVoiceBased() &&
      channel.type !== ChannelType.GuildCategory
    ) {
      throw new Error(`Channel ${channelId} does not support permission overwrites`);
    }

    const ch = channel as unknown as {
      permissionOverwrites: { delete: (target: unknown) => Promise<void> };
    };

    if (roleId === this.guild.roles.everyone.id) {
      await ch.permissionOverwrites.delete(this.guild.roles.everyone);
    } else {
      const role = this.guild.roles.cache.get(roleId);
      if (!role) throw new Error(`Role ${roleId} not found`);
      await ch.permissionOverwrites.delete(role);
    }

    logger.debug({ guildId: this.guildId, channelId, roleId }, "[discord] overwrite removed");
  }

  // ── Member operations ────────────────────────────────────────────────────────

  async addRoleToMember(memberId: string, roleId: string): Promise<void> {
    const member = await this.guild.members.fetch(memberId);
    const role = this.guild.roles.cache.get(roleId);
    if (!role) throw new Error(`Role ${roleId} not found`);
    await member.roles.add(role);
    logger.debug(
      { guildId: this.guildId, memberId, roleId, roleName: role.name },
      "[discord] role added to member"
    );
  }

  async removeRoleFromMember(memberId: string, roleId: string): Promise<void> {
    const member = await this.guild.members.fetch(memberId);
    await member.roles.remove(roleId);
    logger.debug({ guildId: this.guildId, memberId, roleId }, "[discord] role removed from member");
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private parsePermissions(permissions: string[]): bigint {
    let bits = 0n;
    for (const name of permissions) {
      // Convert SCREAMING_SNAKE_CASE (our format) to PascalCase (Discord.js v14)
      const pascalCase = toPascalCase(name);
      const key = pascalCase as keyof typeof PermissionFlagsBits;
      if (PermissionFlagsBits[key]) {
        bits |= PermissionFlagsBits[key];
      } else {
        logger.warn(`[parsePermissions] Unknown permission name: "${name}"`);
      }
    }
    return bits;
  }
}
