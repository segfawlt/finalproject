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
      availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
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
      availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
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

    await channel.edit({
      name: options.name,
      parent: parent?.id ?? undefined,
      position: options.position,
      topic: options.topic,
      bitrate: options.bitrate,
      userLimit: options.userLimit,
      nsfw: options.nsfw,
      rateLimitPerUser: options.rateLimitPerUser,
      availableTags,
      defaultReactionEmoji,
      defaultSortOrder: options.defaultSortOrder ?? undefined,
      defaultForumLayout: options.defaultForumLayout ?? undefined,
      defaultThreadRateLimitPerUser: options.defaultThreadRateLimitPerUser,
      flags: options.flags,
      lockPermissions: options.lockPermissions,
    });
  }

  async deleteChannel(id: string): Promise<void> {
    const channel = this.guild.channels.cache.get(id);
    if (!channel) throw new Error(`Channel ${id} not found`);
    await channel.delete();
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

    await channel.edit({
      parent: parent?.id ?? undefined,
      position: options.position,
      lockPermissions: options.lockPermissions,
    });
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
    const role = await this.guild.roles.create({
      name,
      permissions: options?.permissions ? this.parsePermissions(options.permissions) : undefined,
      color: options?.color ?? undefined,
      hoist: options?.hoist,
      mentionable: options?.mentionable,
      position: options?.position,
    });

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

    await role.edit({
      name: options.name,
      permissions: options.permissions ? this.parsePermissions(options.permissions) : undefined,
      color: options.color ?? undefined,
      hoist: options.hoist,
      mentionable: options.mentionable,
      position: options.position,
    });
  }

  async deleteRole(id: string): Promise<void> {
    const role = this.guild.roles.cache.get(id);
    if (!role) throw new Error(`Role ${id} not found`);
    await role.delete();
  }

  async moveRole(id: string, position: number): Promise<void> {
    const role = this.guild.roles.cache.get(id);
    if (!role) throw new Error(`Role ${id} not found`);
    await role.setPosition(position);
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
  }

  // ── Member operations ────────────────────────────────────────────────────────

  async addRoleToMember(memberId: string, roleId: string): Promise<void> {
    const member = await this.guild.members.fetch(memberId);
    const role = this.guild.roles.cache.get(roleId);
    if (!role) throw new Error(`Role ${roleId} not found`);
    await member.roles.add(role);
  }

  async removeRoleFromMember(memberId: string, roleId: string): Promise<void> {
    const member = await this.guild.members.fetch(memberId);
    await member.roles.remove(roleId);
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
