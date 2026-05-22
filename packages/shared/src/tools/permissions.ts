import { z } from "zod";

export const setOverwriteSchema = z.object({
  channel_id: z.string().min(1),
  role_id: z.string().min(1),
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
});

export const removeOverwriteSchema = z.object({
  channel_id: z.string().min(1),
  role_id: z.string().min(1),
});

export type SetOverwriteParams = z.infer<typeof setOverwriteSchema>;
export type RemoveOverwriteParams = z.infer<typeof removeOverwriteSchema>;
