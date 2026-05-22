import { z } from "zod";

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.string()).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const editRoleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export const deleteRoleSchema = z.object({
  id: z.string().min(1),
});

export const moveRoleSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().min(0),
});

export type CreateRoleParams = z.infer<typeof createRoleSchema>;
export type EditRoleParams = z.infer<typeof editRoleSchema>;
export type DeleteRoleParams = z.infer<typeof deleteRoleSchema>;
export type MoveRoleParams = z.infer<typeof moveRoleSchema>;
