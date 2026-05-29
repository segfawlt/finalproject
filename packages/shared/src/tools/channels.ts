import { z } from "zod";
import type { ExecuteContext, CreateChannelResult } from "../execute-context";
import type { Assumption, PlanResult } from "../types";
import { DesiredStateStore } from "../state";

export const channelTypeEnum = z.enum(["text", "voice", "announcement", "stage", "forum", "media"]);

export const forumTagSchema = z.object({
  name: z.string().min(1).max(20),
  moderated: z.boolean().optional(),
  emoji_id: z.string().optional(),
  emoji_name: z.string().optional(),
});

export const defaultReactionEmojiSchema = z.object({
  emoji_id: z.string().optional(),
  emoji_name: z.string().optional(),
});

export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: channelTypeEnum,
  parent_id: z.string().optional(),
  position: z.number().int().min(0).optional(),
  topic: z.string().max(1024).optional(),
  bitrate: z.number().int().min(8000).max(384000).optional(),
  user_limit: z.number().int().min(0).max(99).optional(),
  nsfw: z.boolean().optional(),
  rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
  available_tags: z.array(forumTagSchema).max(20).optional(),
  default_reaction_emoji: defaultReactionEmojiSchema.optional(),
  default_sort_order: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
  default_forum_layout: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  default_thread_rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
  flags: z.number().int().optional(),
  lock_permissions: z.boolean().optional(),
});

export const editChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  type: channelTypeEnum.optional(),
  parent_id: z.string().optional(),
  position: z.number().int().min(0).optional(),
  topic: z.string().max(1024).optional(),
  bitrate: z.number().int().min(8000).max(384000).optional(),
  user_limit: z.number().int().min(0).max(99).optional(),
  nsfw: z.boolean().optional(),
  rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
  available_tags: z.array(forumTagSchema).max(20).optional(),
  default_reaction_emoji: defaultReactionEmojiSchema.optional(),
  default_sort_order: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
  default_forum_layout: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  default_thread_rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
  flags: z.number().int().optional(),
  lock_permissions: z.boolean().optional(),
});

export const deleteChannelSchema = z.object({
  id: z.string().min(1),
});

export const moveChannelSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(0).optional(),
  parent_id: z.string().optional(),
  lock_permissions: z.boolean().optional(),
});

export type CreateChannelParams = z.infer<typeof createChannelSchema>;
export type EditChannelParams = z.infer<typeof editChannelSchema>;
export type DeleteChannelParams = z.infer<typeof deleteChannelSchema>;
export type MoveChannelParams = z.infer<typeof moveChannelSchema>;

const channelTypeMap: Record<string, number> = {
  text: 0,
  voice: 2,
  announcement: 5,
  stage: 13,
  forum: 15,
  media: 16,
};

// ── plan() functions ─────────────────────────────────────────────────────────

export function planChannelCreate(
  params: CreateChannelParams,
  store: DesiredStateStore
): PlanResult {
  const symbol = store.addChannel({
    name: params.name,
    type: channelTypeMap[params.type],
    parentId: params.parent_id,
    position: params.position,
    topic: params.topic ?? null,
    bitrate: params.bitrate,
    userLimit: params.user_limit,
    nsfw: params.nsfw,
    rateLimitPerUser: params.rate_limit_per_user,
    availableTags: params.available_tags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emoji_id,
      emojiName: tag.emoji_name,
    })),
    defaultReactionEmoji: params.default_reaction_emoji
      ? {
          emojiId: params.default_reaction_emoji.emoji_id ?? null,
          emojiName: params.default_reaction_emoji.emoji_name ?? null,
        }
      : undefined,
    defaultSortOrder: params.default_sort_order,
    defaultForumLayout: params.default_forum_layout,
    defaultThreadRateLimitPerUser: params.default_thread_rate_limit_per_user,
    flags: params.flags,
    lockPermissions: params.lock_permissions,
  });
  return { planned: true, symbol };
}

export function planChannelEdit(params: EditChannelParams, store: DesiredStateStore): PlanResult {
  store.editChannel(params.id, {
    name: params.name,
    type: params.type ? channelTypeMap[params.type] : undefined,
    parentId: params.parent_id,
    position: params.position,
    topic: params.topic ?? null,
    bitrate: params.bitrate,
    userLimit: params.user_limit,
    nsfw: params.nsfw,
    rateLimitPerUser: params.rate_limit_per_user,
    availableTags: params.available_tags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emoji_id,
      emojiName: tag.emoji_name,
    })),
    defaultReactionEmoji: params.default_reaction_emoji
      ? {
          emojiId: params.default_reaction_emoji.emoji_id ?? null,
          emojiName: params.default_reaction_emoji.emoji_name ?? null,
        }
      : undefined,
    defaultSortOrder: params.default_sort_order,
    defaultForumLayout: params.default_forum_layout,
    defaultThreadRateLimitPerUser: params.default_thread_rate_limit_per_user,
    flags: params.flags,
    lockPermissions: params.lock_permissions,
  });
  return { planned: true };
}

export function planChannelDelete(
  params: DeleteChannelParams,
  store: DesiredStateStore
): PlanResult {
  store.removeChannel(params.id);
  return { planned: true };
}

export function planChannelMove(params: MoveChannelParams, store: DesiredStateStore): PlanResult {
  store.editChannel(params.id, {
    parentId: params.parent_id,
    position: params.position,
    lockPermissions: params.lock_permissions,
  });
  return { planned: true };
}

// ── execute() functions ──────────────────────────────────────────────────────

export async function executeChannelCreate(
  params: CreateChannelParams,
  ctx: ExecuteContext
): Promise<CreateChannelResult> {
  return ctx.createChannel(params.name, channelTypeMap[params.type], {
    parentId: params.parent_id,
    position: params.position,
    topic: params.topic,
    bitrate: params.bitrate,
    userLimit: params.user_limit,
    nsfw: params.nsfw,
    rateLimitPerUser: params.rate_limit_per_user,
    availableTags: params.available_tags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emoji_id,
      emojiName: tag.emoji_name,
    })),
    defaultReactionEmoji: params.default_reaction_emoji
      ? {
          emojiId: params.default_reaction_emoji.emoji_id ?? null,
          emojiName: params.default_reaction_emoji.emoji_name ?? null,
        }
      : undefined,
    defaultSortOrder: params.default_sort_order,
    defaultForumLayout: params.default_forum_layout,
    defaultThreadRateLimitPerUser: params.default_thread_rate_limit_per_user,
    flags: params.flags,
    lockPermissions: params.lock_permissions,
  });
}

export async function executeChannelEdit(
  params: EditChannelParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.editChannel(params.id, {
    name: params.name,
    type: params.type ? channelTypeMap[params.type] : undefined,
    parentId: params.parent_id,
    position: params.position,
    topic: params.topic,
    bitrate: params.bitrate,
    userLimit: params.user_limit,
    nsfw: params.nsfw,
    rateLimitPerUser: params.rate_limit_per_user,
    availableTags: params.available_tags?.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emoji_id,
      emojiName: tag.emoji_name,
    })),
    defaultReactionEmoji: params.default_reaction_emoji
      ? {
          emojiId: params.default_reaction_emoji.emoji_id ?? null,
          emojiName: params.default_reaction_emoji.emoji_name ?? null,
        }
      : undefined,
    defaultSortOrder: params.default_sort_order,
    defaultForumLayout: params.default_forum_layout,
    defaultThreadRateLimitPerUser: params.default_thread_rate_limit_per_user,
    flags: params.flags,
    lockPermissions: params.lock_permissions,
  });
}

export async function executeChannelDelete(
  params: DeleteChannelParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.deleteChannel(params.id);
}

export async function executeChannelMove(
  params: MoveChannelParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.moveChannel(params.id, {
    parentId: params.parent_id,
    position: params.position,
    lockPermissions: params.lock_permissions,
  });
}

// ── getAssumptions() functions ───────────────────────────────────────────────

export function getChannelCreateAssumptions(params: CreateChannelParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "unique_name",
      value: params.name,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
  ];
  if (params.parent_id) {
    assumptions.push({
      type: "exists",
      value: params.parent_id,
      resourceType: "category",
      checked: false,
      status: "pending",
    });
  }
  return assumptions;
}

export function getChannelEditAssumptions(params: EditChannelParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "exists",
      value: params.id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
  ];
  if (params.name) {
    assumptions.push({
      type: "unique_name",
      value: params.name,
      resourceType: "channel",
      checked: false,
      status: "pending",
    });
  }
  if (params.parent_id) {
    assumptions.push({
      type: "exists",
      value: params.parent_id,
      resourceType: "category",
      checked: false,
      status: "pending",
    });
  }
  return assumptions;
}

export function getChannelDeleteAssumptions(params: DeleteChannelParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
    {
      type: "not_system_channel",
      value: params.id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
  ];
}

export function getChannelMoveAssumptions(params: MoveChannelParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "exists",
      value: params.id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
  ];
  if (params.parent_id) {
    assumptions.push({
      type: "exists",
      value: params.parent_id,
      resourceType: "category",
      checked: false,
      status: "pending",
    });
  }
  return assumptions;
}
