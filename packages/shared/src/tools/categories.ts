import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).optional(),
});

export const editCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  position: z.number().int().min(0).optional(),
});

export const deleteCategorySchema = z.object({
  id: z.string().min(1),
});

export type CreateCategoryParams = z.infer<typeof createCategorySchema>;
export type EditCategoryParams = z.infer<typeof editCategorySchema>;
export type DeleteCategoryParams = z.infer<typeof deleteCategorySchema>;
