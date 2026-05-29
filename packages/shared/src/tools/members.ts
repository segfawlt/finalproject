import { z } from "zod";
import type { ExecuteContext } from "../execute-context";
import type { Assumption, PlanResult } from "../types";
import { DesiredStateStore } from "../state";

export const createMemberRoleSchema = z.object({
  member_id: z.string().min(1),
  role_id: z.string().min(1),
});

export const removeMemberRoleSchema = z.object({
  member_id: z.string().min(1),
  role_id: z.string().min(1),
});

export type CreateMemberRoleParams = z.infer<typeof createMemberRoleSchema>;
export type RemoveMemberRoleParams = z.infer<typeof removeMemberRoleSchema>;

// ── plan() functions ─────────────────────────────────────────────────────────

export function planMemberRoleAdd(
  params: CreateMemberRoleParams,
  store: DesiredStateStore
): PlanResult {
  store.addMemberRole(params.member_id, params.role_id);
  return { planned: true };
}

export function planMemberRoleRemove(
  params: RemoveMemberRoleParams,
  store: DesiredStateStore
): PlanResult {
  store.removeMemberRole(params.member_id, params.role_id);
  return { planned: true };
}

// ── execute() functions ──────────────────────────────────────────────────────

export async function executeMemberRoleAdd(
  params: CreateMemberRoleParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.addRoleToMember(params.member_id, params.role_id);
}

export async function executeMemberRoleRemove(
  params: RemoveMemberRoleParams,
  ctx: ExecuteContext
): Promise<void> {
  return ctx.removeRoleFromMember(params.member_id, params.role_id);
}

// ── getAssumptions() functions ───────────────────────────────────────────────

export function getMemberRoleAddAssumptions(params: CreateMemberRoleParams): Assumption[] {
  return [
    {
      type: "member_exists",
      value: params.member_id,
      resourceType: "member",
      checked: false,
      status: "pending",
    },
    {
      type: "role_assigned",
      value: params.role_id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}

export function getMemberRoleRemoveAssumptions(params: RemoveMemberRoleParams): Assumption[] {
  return [
    {
      type: "member_exists",
      value: params.member_id,
      resourceType: "member",
      checked: false,
      status: "pending",
    },
    {
      type: "role_assigned",
      value: params.role_id,
      resourceType: "role",
      checked: false,
      status: "pending",
    },
  ];
}
