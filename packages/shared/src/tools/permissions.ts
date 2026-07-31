import { z } from "zod";
import type { ExecuteContext } from "../execute-context";
import type { Assumption, PlanResult } from "../types";
import { DesiredStateStore } from "../state";
import { permissionNameSchema } from "../constants";

export const setOverwriteSchema = z.object({
  channel_id: z.string().min(1),
  role_id: z.string().min(1),
  allow: z.array(permissionNameSchema).optional(),
  deny: z.array(permissionNameSchema).optional(),
});

export const removeOverwriteSchema = z.object({
  channel_id: z.string().min(1),
  role_id: z.string().min(1),
});

export const batchSetOverwriteSchema = z.object({
  overwrites: z
    .array(
      z.object({
        channel_id: z.string().min(1),
        role_id: z.string().min(1),
        allow: z.array(permissionNameSchema).optional(),
        deny: z.array(permissionNameSchema).optional(),
      })
    )
    .min(1),
});

export type SetOverwriteParams = z.infer<typeof setOverwriteSchema>;
export type RemoveOverwriteParams = z.infer<typeof removeOverwriteSchema>;
export type BatchSetOverwriteParams = z.infer<typeof batchSetOverwriteSchema>;

// ── plan() functions ─────────────────────────────────────────────────────────

export function planOverwriteSet(params: SetOverwriteParams, store: DesiredStateStore): PlanResult {
  store.setOverwrite(params.channel_id, params.role_id, params.allow, params.deny);
  return { planned: true };
}

export function planOverwriteRemove(
  params: RemoveOverwriteParams,
  store: DesiredStateStore
): PlanResult {
  store.removeOverwrite(params.channel_id, params.role_id);
  return { planned: true };
}

export function planOverwriteBatch(
  params: BatchSetOverwriteParams,
  store: DesiredStateStore
): PlanResult {
  store.validateReferences(
    params.overwrites.flatMap((ow) => [
      { id: ow.channel_id, type: "channel" as const },
      { id: ow.role_id, type: "role" as const },
    ])
  );
  for (const ow of params.overwrites) {
    store.setOverwrite(ow.channel_id, ow.role_id, ow.allow, ow.deny);
  }
  return { planned: true };
}

// ── execute() functions ──────────────────────────────────────────────────────

export async function executeOverwriteSet(
  params: SetOverwriteParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.setOverwrite(params.channel_id, params.role_id, {
    allow: params.allow,
    deny: params.deny,
  });
}

export async function executeOverwriteRemove(
  params: RemoveOverwriteParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.removeOverwrite(params.channel_id, params.role_id);
}

// ── getAssumptions() functions ───────────────────────────────────────────────

export function getOverwriteSetAssumptions(params: SetOverwriteParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.channel_id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
    {
      type: "exists",
      value: params.role_id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}

export function getOverwriteRemoveAssumptions(params: RemoveOverwriteParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.channel_id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    },
    {
      type: "exists",
      value: params.role_id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}

export function getOverwriteBatchAssumptions(params: BatchSetOverwriteParams): Assumption[] {
  const assumptions: Assumption[] = [];
  for (const ow of params.overwrites) {
    assumptions.push({
      type: "exists",
      value: ow.channel_id,
      resourceType: "channel",
      checked: false,
      status: "pending",
    });
    assumptions.push({
      type: "exists",
      value: ow.role_id,
      resourceType: "role",
      checked: false,
      status: "pending",
    });
  }
  return assumptions;
}
