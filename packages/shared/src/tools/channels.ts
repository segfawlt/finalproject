import { z } from "zod";

export const channelTypeEnum = z.enum([
  "text",
  "voice",
  "announcement",
  "stage",
  "forum",
]);

export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: channelTypeEnum,
  parent_id: z.string().optional(),
  position: z.number().int().min(0).optional(),
  topic: z.string().max(1024).optional(),
});

export const editChannelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  type: channelTypeEnum.optional(),
  parent_id: z.string().optional(),
  position: z.number().int().min(0).optional(),
  topic: z.string().max(1024).optional(),
});

export const deleteChannelSchema = z.object({
  id: z.string().min(1),
});

export const moveChannelSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(0).optional(),
  parent_id: z.string().optional(),
});

export type CreateChannelParams = z.infer<typeof createChannelSchema>;
export type EditChannelParams = z.infer<typeof editChannelSchema>;
export type DeleteChannelParams = z.infer<typeof deleteChannelSchema>;
export type MoveChannelParams = z.infer<typeof moveChannelSchema>;
