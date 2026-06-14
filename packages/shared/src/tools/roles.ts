import { z } from "zod";
import type { ExecuteContext, CreateRoleResult } from "../execute-context";
import type { Assumption, PlanResult } from "../types";
import { DesiredStateStore } from "../state";
import { permissionNameSchema } from "../constants";

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(permissionNameSchema).optional(),
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
  permissions: z.array(permissionNameSchema).optional(),
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

function parseColor(color?: string): number | undefined {
  if (!color) return undefined;
  return parseInt(color.replace("#", ""), 16);
}

// ── plan() functions ─────────────────────────────────────────────────────────

export function planRoleCreate(params: CreateRoleParams, store: DesiredStateStore): PlanResult {
  const symbol = store.addRole({
    name: params.name,
    permissions: params.permissions,
    color: parseColor(params.color),
    hoist: params.hoist,
    mentionable: params.mentionable,
    position: params.position,
  });
  return { planned: true, symbol };
}

export function planRoleEdit(params: EditRoleParams, store: DesiredStateStore): PlanResult {
  store.editRole(params.id, {
    name: params.name,
    permissions: params.permissions,
    color: parseColor(params.color),
    hoist: params.hoist,
    mentionable: params.mentionable,
    position: params.position,
  });
  return { planned: true };
}

export function planRoleDelete(params: DeleteRoleParams, store: DesiredStateStore): PlanResult {
  store.removeRole(params.id);
  return { planned: true };
}

export function planRoleMove(params: MoveRoleParams, store: DesiredStateStore): PlanResult {
  store.editRole(params.id, { position: params.position });
  return { planned: true };
}

// ── execute() functions ──────────────────────────────────────────────────────

export async function executeRoleCreate(
  params: CreateRoleParams,
  ctx: ExecuteContext
): Promise<CreateRoleResult> {
  return ctx.createRole(params.name, {
    permissions: params.permissions,
    color: parseColor(params.color),
    hoist: params.hoist,
    mentionable: params.mentionable,
    position: params.position,
  });
}

export async function executeRoleEdit(params: EditRoleParams, ctx: ExecuteContext): Promise<void> {
  return ctx.editRole(params.id, {
    name: params.name,
    permissions: params.permissions,
    color: parseColor(params.color),
    hoist: params.hoist,
    mentionable: params.mentionable,
    position: params.position,
  });
}

export async function executeRoleDelete(
  params: DeleteRoleParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.deleteRole(params.id);
}

export async function executeRoleMove(params: MoveRoleParams, ctx: ExecuteContext): Promise<void> {
  return ctx.moveRole(params.id, params.position);
}

// ── getAssumptions() functions ───────────────────────────────────────────────

export function getRoleCreateAssumptions(params: CreateRoleParams): Assumption[] {
  return [
    {
      type: "unique_name",
      value: params.name,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "bot_position",
      value: params.name,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}

export function getRoleEditAssumptions(params: EditRoleParams): Assumption[] {
  const assumptions: Assumption[] = [
    {
      type: "exists",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "bot_position",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
  if (params.name) {
    assumptions.push({
      type: "unique_name",
      value: params.name,
      resourceType: "role",
      checked: false,
      status: "pending",
      excludeId: params.id,
    });
  }
  return assumptions;
}

export function getRoleDeleteAssumptions(params: DeleteRoleParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "not_everyone",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "bot_position",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}

export function getRoleMoveAssumptions(params: MoveRoleParams): Assumption[] {
  return [
    {
      type: "exists",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "position_valid",
      value: String(params.position),
      resourceType: "role",
      checked: false,
      status: "pending",
    },
    {
      type: "bot_position",
      value: params.id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}
