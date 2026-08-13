import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppVariables } from "../../types";

const state = vi.hoisted(() => ({
  conversations: [] as Array<Record<string, unknown>>,
  iterations: [] as Array<Record<string, unknown>>,
  plans: [] as Array<Record<string, unknown>>,
  conversationsTable: { id: "conversation_id" },
  planIterationsTable: { conversationId: "conversation_id", version: "version" },
  plansTable: { id: "plan_id", guildId: "guild_id" },
  session: undefined as
    | { status: string; lastSummary: string; lastReasoning: string }
    | undefined,
}));

function query(rows: Array<Record<string, unknown>>) {
  return {
    then: <T>(
      resolve: (value: Array<Record<string, unknown>>) => T | PromiseLike<T>,
      reject?: (reason: unknown) => T | PromiseLike<T>
    ) => Promise.resolve(rows).then(resolve, reject),
    orderBy: () => query(rows),
    limit: async () => rows,
  };
}

const conversations = state.conversationsTable;
const planIterations = state.planIterationsTable;
const plans = state.plansTable;

vi.mock("@repo/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const rows =
          table === state.conversationsTable
            ? state.conversations
            : table === state.planIterationsTable
              ? state.iterations
              : table === state.plansTable
                ? state.plans
                : [];
        return { where: () => query(rows), orderBy: () => query(rows) };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const created = { id: "plan-1", ...values };
        if (table === state.plansTable) state.plans.push(created);
        return { returning: async () => [created] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  },
  conversations: state.conversationsTable,
  planIterations: state.planIterationsTable,
  plans: state.plansTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  desc: () => ({}),
  ne: () => ({}),
  and: () => ({}),
}));
vi.mock("@repo/shared", () => ({
  hashServerState: vi.fn(() => "fork-hash"),
  getTool: vi.fn(),
  evaluateAssumptions: vi.fn(),
  fork: vi.fn(),
}));
vi.mock("../../auth/helpers", () => ({ userHasManageGuild: vi.fn(async () => true) }));
vi.mock("../../auth/middleware", () => ({ requireUser: (c: { get: (key: string) => unknown }) => c.get("user") }));
vi.mock("../../planning/guild-check", () => ({ checkGuildOperable: vi.fn(() => ({ ok: true })) }));
vi.mock("../../planning/guild-rules", () => ({ loadGuildRuleTexts: vi.fn(async () => []) }));
vi.mock("../../planning/locking", () => ({
  isGuildLocked: vi.fn(async () => false),
  acquireGuildLock: vi.fn(),
  releaseGuildLock: vi.fn(),
  heartbeatGuildLock: vi.fn(),
}));
vi.mock("../../planning/session-manager", () => ({
  getSession: vi.fn(() => state.session),
  getSessionsByGuild: vi.fn(() => []),
  setSession: vi.fn(),
  removeSession: vi.fn(),
  setSessionTimeout: vi.fn(),
  clearSessionTimeout: vi.fn(),
}));
vi.mock("../../planning/planning-event-bus", () => ({ emitConversationEvent: vi.fn() }));
vi.mock("../../planning/event-bus", () => ({ emitPlanEvent: vi.fn() }));
vi.mock("../../planning/planning-session", () => ({ PlanningSession: class {} }));
vi.mock("../../planning/diff-engine", () => ({ diffEngine: vi.fn() }));
vi.mock("../../planning/execution-engine", () => ({
  executePlan: vi.fn(),
  buildCurrentStateFromDiscord: vi.fn(),
  rollbackFull: vi.fn(),
}));
vi.mock("../../planning/validation", () => ({ validatePlan: vi.fn() }));
vi.mock("../../planning/repair-context", () => ({ buildRepairPrompt: vi.fn() }));
vi.mock("../../bot/execute-context", () => ({ DiscordExecuteContext: class {} }));
vi.mock("../../bot/cache", () => ({ guildCache: { get: vi.fn(() => undefined) } }));
vi.mock("../../bot/client", () => ({
  botClient: { guilds: { cache: { get: vi.fn(() => undefined) } } },
}));
vi.mock("../../env-validated", () => ({ validatedEnv: { LLM_MODEL: "test/model" } }));
vi.mock("../../utils/logger", () => ({ logger: { error: vi.fn() } }));

import conversationsApp from "./conversations";
import plansApp from "./plans";

function makeApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AppVariables["user"]);
    await next();
  });
  app.route("/guilds/:guildId/conversations", conversationsApp);
  app.route("/guilds/:guildId/plans", plansApp);
  return app;
}

describe("approved plan reasoning privacy", () => {
  beforeEach(() => {
    state.conversations = [
      {
        id: "conversation-1",
        guildId: "guild-1",
        status: "completed",
        userPrompt: "Create a private staff channel",
      },
    ];
    state.iterations = [{ desiredState: { guildId: "guild-1", channels: [] } }];
    state.plans = [];
    state.session = {
      status: "completed",
      lastSummary: "A staff channel will be created.",
      lastReasoning: "PRIVATE_REASONING_DO_NOT_EXPOSE",
    };
  });

  it("does not persist session reasoning through approved plan list or detail responses", async () => {
    const app = makeApp();
    const approval = await app.request("/guilds/guild-1/conversations/conversation-1/approve", {
      method: "POST",
    });

    expect(approval.status).toBe(200);
    const { planId } = (await approval.json()) as { planId: string };

    const detail = await app.request(`/guilds/guild-1/plans/${planId}`);
    const list = await app.request("/guilds/guild-1/plans");

    expect(detail.status).toBe(200);
    expect(list.status).toBe(200);
    expect(JSON.stringify(await detail.json())).not.toContain("PRIVATE_REASONING_DO_NOT_EXPOSE");
    expect(JSON.stringify(await list.json())).not.toContain("PRIVATE_REASONING_DO_NOT_EXPOSE");
  });
});
