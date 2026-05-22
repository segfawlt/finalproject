import { z } from "zod";

export const askUserSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ label: z.string() })).optional(),
  multiSelect: z.boolean().optional(),
  allowCustom: z.boolean().optional(),
});

export type AskUserParams = z.infer<typeof askUserSchema>;
