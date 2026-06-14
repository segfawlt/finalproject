import { z } from "zod";
import type { ExecuteContext, CreateChannelResult } from "../execute-context";
import type { Assumption, PlanResult } from "../types";
import { DesiredStateStore, CategoryHasChildrenError } from "../state";

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

export function planCategoryCreate(
  params: CreateCategoryParams,
  store: DesiredStateStore
): PlanResult {
  const symbol = store.addCategory({
    name: params.name,
    position: params.position,
  });
  return { planned: true, symbol };
}

export async function executeCategoryCreate(
  params: CreateCategoryParams,
  ctx: ExecuteContext
): Promise<CreateChannelResult> {
  return ctx.createChannel(params.name, 4, {
    position: params.position,
  });
}

export function planCategoryEdit(params: EditCategoryParams, store: DesiredStateStore): PlanResult {
  store.editCategory(params.id, {
    name: params.name,
    position: params.position,
  });
  return { planned: true };
}

export async function executeCategoryEdit(
  params: EditCategoryParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.editChannel(params.id, {
    name: params.name,
    position: params.position,
  });
}

export function planCategoryDelete(
  params: DeleteCategoryParams,
  store: DesiredStateStore,
): PlanResult {
  try {
    store.removeCategory(params.id);
    return { planned: true };
  } catch (err) {
    if (err instanceof CategoryHasChildrenError) {
      return {
        planned: false,
        blocked: true,
        reason: "category_has_children",
        children: err.children,
      };
    }
    throw err;
  }
}

export async function executeCategoryDelete(
  params: DeleteCategoryParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.deleteChannel(params.id);
}

export function getCategoryCreateAssumptions(params: CreateCategoryParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "unique_name",
      value: params.name,
      resourceType: "category",
      checked: false,
      status: "pending",
    },
  ];
  return assumptions;
}

export function getCategoryEditAssumptions(params: EditCategoryParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "exists",
      value: params.id,
      resourceType: "category",
      checked: false,
      status: "pending",
    },
  ];
  if (params.name) {
    assumptions.push({
      type: "unique_name",
      value: params.name,
      resourceType: "category",
      checked: false,
      status: "pending",
    });
  }
  return assumptions;
}

export function getCategoryDeleteAssumptions(params: DeleteCategoryParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.id,
      resourceType: "category",
      checked: false,
      status: "pending",
    },
    {
      type: "no_children",
      value: params.id,
      resourceType: "category",
      checked: false,
      status: "pending",
    },
  ];
}
