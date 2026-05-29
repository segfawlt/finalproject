import { describe, it, expect } from "vitest";
import { executePlan } from "./execution-engine";
import type { ExecuteContext } from "@repo/shared";
import type { PlanStep } from "@repo/shared";
import type { ExecutionEvent } from "./execution-engine";

function makeStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    index: 0,
    toolName: "add_role_to_member",
    params: { member_id: "user-1", role_id: "role-1" },
    status: "pending",
    resolvedParams: { member_id: "user-1", role_id: "role-1" },
    ...overrides,
  };
}

describe("executePlan — member tools", () => {
  it("executes add_role_to_member step", async () => {
    const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
    const mockCtx: ExecuteContext = {
      guildId: "g1",
      addRoleToMember: async (memberId: string, roleId: string) => {
        calls.push({ toolName: "add_role_to_member", params: { memberId, roleId } });
      },
    } as unknown as ExecuteContext;

    const events: ExecutionEvent[] = [];
    const emit = async (event: ExecutionEvent) => {
      events.push(event);
    };

    const result = await executePlan({
      planId: "plan-1",
      steps: [makeStep()],
      symbolTable: {},
      ctx: mockCtx,
      emit,
    });

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual({ memberId: "user-1", roleId: "role-1" });
  });

  it("executes remove_role_from_member step", async () => {
    const calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
    const mockCtx: ExecuteContext = {
      guildId: "g1",
      removeRoleFromMember: async (memberId: string, roleId: string) => {
        calls.push({ toolName: "remove_role_from_member", params: { memberId, roleId } });
      },
    } as unknown as ExecuteContext;

    const events: ExecutionEvent[] = [];
    const emit = async (event: ExecutionEvent) => {
      events.push(event);
    };

    const result = await executePlan({
      planId: "plan-1",
      steps: [
        makeStep({
          toolName: "remove_role_from_member",
          params: { member_id: "user-1", role_id: "role-1" },
          resolvedParams: { member_id: "user-1", role_id: "role-1" },
        }),
      ],
      symbolTable: {},
      ctx: mockCtx,
      emit,
    });

    expect(result.success).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual({ memberId: "user-1", roleId: "role-1" });
  });
});
