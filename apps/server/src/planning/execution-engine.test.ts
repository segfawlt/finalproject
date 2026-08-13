import { describe, it, expect, vi } from "vitest";
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

describe("executePlan — per-step deadline", () => {
  it("interrupts a hung step when the abort signal fires mid-step", async () => {
    // Tool call never resolves — only the abort can end the step.
    const mockCtx: ExecuteContext = {
      guildId: "g1",
      addRoleToMember: () => new Promise<void>(() => {}),
    } as unknown as ExecuteContext;

    const events: ExecutionEvent[] = [];
    const emit = async (event: ExecutionEvent) => {
      events.push(event);
    };

    const controller = new AbortController();
    setTimeout(() => controller.abort("User requested abort"), 5);

    const result = await executePlan({
      planId: "plan-1",
      steps: [makeStep()],
      symbolTable: {},
      ctx: mockCtx,
      emit,
      abortSignal: controller.signal,
      stepTimeoutMs: 60_000, // long: prove the abort, not the deadline, ends it
    });

    expect(result.success).toBe(false);
    expect(result.failedStep?.status).toBe("failed");
    expect(events.some((e) => e.type === "plan_failed")).toBe(true);
  });

  it("fails a step that exceeds its deadline without retrying an uncertain mutation", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const mockCtx: ExecuteContext = {
        guildId: "g1",
        addRoleToMember: () => {
          calls++;
          return new Promise<void>(() => {}); // hangs every attempt
        },
      } as unknown as ExecuteContext;

      const events: ExecutionEvent[] = [];
      const emit = async (event: ExecutionEvent) => {
        events.push(event);
      };

      const promise = executePlan({
        planId: "plan-1",
        steps: [makeStep()],
        symbolTable: {},
        ctx: mockCtx,
        emit,
        stepTimeoutMs: 100,
      });

      // Drive the single deadline. A timed-out Discord request may still settle remotely.
      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(calls).toBe(1);
      expect(events.filter((e) => e.type === "step_retry")).toHaveLength(0);
      expect(events.some((e) => e.type === "plan_failed")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry a timed-out mutation that may have completed remotely", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const mockCtx: ExecuteContext = {
        guildId: "g1",
        addRoleToMember: () => {
          calls++;
          return new Promise<void>(() => {});
        },
      } as unknown as ExecuteContext;

      const promise = executePlan({
        planId: "plan-1",
        steps: [makeStep()],
        symbolTable: {},
        ctx: mockCtx,
        emit: async () => {},
        stepTimeoutMs: 100,
      });

      await vi.advanceTimersByTimeAsync(100);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
