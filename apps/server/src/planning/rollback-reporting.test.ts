import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExecuteContext, ServerState } from "@repo/shared";
import type { ExecutionEvent } from "./execution-engine";

// Mock the Discord client so buildCurrentStateFromDiscord returns a valid
// (empty) state instead of throwing "Guild not found".
vi.mock("../bot/client", () => ({
  botClient: {
    guilds: {
      cache: {
        get: () => ({
          name: "Test Guild",
          memberCount: 0,
          channels: { fetch: async () => new Map() },
          roles: { fetch: async () => new Map() },
        }),
      },
    },
  },
}));

// Mock the diff engine so each test can force the reverse-diff outcome.
const diffEngineMock = vi.fn();
vi.mock("./diff-engine", () => ({
  diffEngine: (...args: unknown[]) => diffEngineMock(...args),
}));

import { rollbackFull } from "./execution-engine";

const beforeSnapshot: ServerState = {
  guildId: "g1",
  guildName: "Test Guild",
  memberCount: 0,
  channels: [],
  roles: [],
  overwrites: [],
};

function collectEmit() {
  const events: ExecutionEvent[] = [];
  const emit = async (event: ExecutionEvent) => {
    events.push(event);
  };
  return { events, emit };
}

describe("rollbackFull — failure reporting (flaw #5)", () => {
  beforeEach(() => {
    diffEngineMock.mockReset();
  });

  it("emits rollback_failed (not rollback_completed) when the reverse diff is blocked by conflicts", async () => {
    diffEngineMock.mockReturnValue({
      steps: [],
      symbolTable: {},
      conflicts: [{ message: "role hierarchy prevents restore" }],
    });

    const ctx = { guildId: "g1" } as unknown as ExecuteContext;
    const { events, emit } = collectEmit();

    const result = await rollbackFull(beforeSnapshot, "plan-1", ctx, emit);

    expect(result.success).toBe(false);
    expect(events.some((e) => e.type === "rollback_completed")).toBe(false);
    const failed = events.find((e) => e.type === "rollback_failed");
    expect(failed).toBeDefined();
    expect(failed?.error).toContain("role hierarchy prevents restore");
  });

  it("emits rollback_failed when a reverse-diff step fails to execute", async () => {
    diffEngineMock.mockReturnValue({
      steps: [
        {
          index: 0,
          toolName: "add_role_to_member",
          params: { member_id: "u1", role_id: "r1" },
          resolvedParams: { member_id: "u1", role_id: "r1" },
          status: "pending",
        },
      ],
      symbolTable: {},
      conflicts: [],
    });

    // Non-transient error (403) fails fast with no retries.
    const ctx = {
      guildId: "g1",
      addRoleToMember: async () => {
        throw Object.assign(new Error("Missing Permissions"), { code: 403 });
      },
    } as unknown as ExecuteContext;
    const { events, emit } = collectEmit();

    const result = await rollbackFull(beforeSnapshot, "plan-1", ctx, emit);

    expect(result.success).toBe(false);
    expect(events.some((e) => e.type === "rollback_completed")).toBe(false);
    expect(events.some((e) => e.type === "rollback_failed")).toBe(true);
  });

  it("emits rollback_completed when the reverse diff succeeds", async () => {
    diffEngineMock.mockReturnValue({
      steps: [
        {
          index: 0,
          toolName: "add_role_to_member",
          params: { member_id: "u1", role_id: "r1" },
          resolvedParams: { member_id: "u1", role_id: "r1" },
          status: "pending",
        },
      ],
      symbolTable: {},
      conflicts: [],
    });

    const ctx = {
      guildId: "g1",
      addRoleToMember: async () => {},
    } as unknown as ExecuteContext;
    const { events, emit } = collectEmit();

    const result = await rollbackFull(beforeSnapshot, "plan-1", ctx, emit);

    expect(result.success).toBe(true);
    expect(events.some((e) => e.type === "rollback_completed")).toBe(true);
    expect(events.some((e) => e.type === "rollback_failed")).toBe(false);
  });

  it("treats a no-op reverse diff as a successful rollback", async () => {
    diffEngineMock.mockReturnValue({ steps: [], symbolTable: {}, conflicts: [] });

    const ctx = { guildId: "g1" } as unknown as ExecuteContext;
    const { events, emit } = collectEmit();

    const result = await rollbackFull(beforeSnapshot, "plan-1", ctx, emit);

    expect(result.success).toBe(true);
    expect(events.some((e) => e.type === "rollback_completed")).toBe(true);
  });
});
