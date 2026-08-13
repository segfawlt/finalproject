import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppVariables } from "../../types";

const state = vi.hoisted(() => ({
  allowed: true,
  settingRows: [] as Array<{ value: unknown }>,
  conversationRows: [] as Array<Record<string, unknown>>,
  catalog: [] as Array<Record<string, unknown>>,
  catalogFailure: false,
  catalogCalls: 0,
  conversationLookupError: undefined as Error | undefined,
  templateRows: [] as Array<Record<string, unknown>>,
  inserted: undefined as Record<string, unknown> | undefined,
  updated: undefined as Record<string, unknown> | undefined,
  sessionOptions: undefined as Record<string, unknown> | undefined,
  createdSession: undefined as { addTemplate: ReturnType<typeof vi.fn> } | undefined,
  activeSession: undefined as { addTemplate: ReturnType<typeof vi.fn> } | undefined,
}));

vi.mock("@repo/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === appSettings) return state.settingRows;
          if (table === conversations && state.conversationLookupError) {
            return {
              then: <T>(
                _resolve: (value: typeof state.conversationRows) => T | PromiseLike<T>,
                reject: (reason: Error) => T | PromiseLike<T>
              ) => reject(state.conversationLookupError!),
              orderBy: async () => {
                throw state.conversationLookupError;
              },
            };
          }
          const rows =
            table === planIterations
              ? []
              : table === templates
                ? state.templateRows
                : state.conversationRows;
          return {
            then: <T>(resolve: (value: typeof rows) => T | PromiseLike<T>) =>
              Promise.resolve(rows).then(resolve),
            orderBy: async () => rows,
          };
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserted = values;
        return {
          returning: async () => [{ id: "conversation-1", ...values }],
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.updated = values;
        return {
          where: async () => [{ ...state.conversationRows[0], ...values }],
        };
      },
    }),
  },
  appSettings: { key: "key" },
  conversations: { id: "id" },
  planIterations: { conversationId: "conversation_id", version: "version" },
  plans: {},
  templates: { id: "id", authorId: "author_id" },
}));

vi.mock("drizzle-orm", () => ({ eq: () => ({}), desc: () => ({}), and: () => ({}) }));
vi.mock("@repo/shared", () => ({ hashServerState: vi.fn(() => "fork-hash") }));
vi.mock("../../auth/helpers", () => ({ userHasManageGuild: vi.fn(async () => state.allowed) }));
vi.mock("../../planning/guild-check", () => ({ checkGuildOperable: vi.fn(() => ({ ok: true })) }));
vi.mock("../../planning/guild-rules", () => ({ loadGuildRuleTexts: vi.fn(async () => []) }));
vi.mock("../../planning/locking", () => ({ isGuildLocked: vi.fn(async () => false) }));
vi.mock("../../planning/session-manager", () => ({
  getSession: vi.fn(() => state.activeSession),
  setSession: vi.fn(),
  removeSession: vi.fn(),
  setSessionTimeout: vi.fn(),
  clearSessionTimeout: vi.fn(),
}));
vi.mock("../../planning/planning-event-bus", () => ({ emitConversationEvent: vi.fn() }));
vi.mock("../../planning/planning-session", () => ({
  PlanningSession: class {
    constructor(options: Record<string, unknown>) {
      state.sessionOptions = options;
      state.createdSession = this as unknown as { addTemplate: ReturnType<typeof vi.fn> };
    }
    addTemplate = vi.fn();
    start() {
      return Promise.resolve();
    }
  },
}));
vi.mock("../../planning/openrouter-models", () => ({
  getOpenRouterModels: vi.fn(async () => {
    state.catalogCalls++;
    if (state.catalogFailure) throw new Error("OpenRouter unavailable");
    return state.catalog;
  }),
}));
vi.mock("../../env-validated", () => ({
  validatedEnv: {
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_API_KEY: "test-key",
    LLM_MODEL: "fallback/model",
  },
}));
vi.mock("../../bot/cache", () => ({
  guildCache: { get: vi.fn(() => undefined) },
}));
vi.mock("../../bot/client", () => ({
  botClient: { guilds: { cache: { get: vi.fn(() => undefined) } } },
}));

import { appSettings, conversations, planIterations, templates } from "@repo/db";
import conversationsApp from "./conversations";

function makeApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AppVariables["user"]);
    await next();
  });
  app.route("/guilds/:guildId/conversations", conversationsApp);
  return app;
}

const model = {
  id: "openai/tool-model",
  name: "Tool model",
  description: "",
  supportsTools: true,
  reasoning: {
    supportedEfforts: ["low", "high"],
    defaultEffort: "low",
    defaultEnabled: true,
  },
};

describe("conversation model configuration routes", () => {
  beforeEach(() => {
    state.allowed = true;
    state.settingRows = [{ value: [model.id] }];
    state.conversationRows = [];
    state.catalog = [model];
    state.catalogFailure = false;
    state.catalogCalls = 0;
    state.conversationLookupError = undefined;
    state.templateRows = [];
    state.inserted = undefined;
    state.updated = undefined;
    state.sessionOptions = undefined;
    state.createdSession = undefined;
    state.activeSession = undefined;
  });

  it("persists a valid model selection when a conversation is created", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPrompt: "Create a staff channel",
        modelConfig: { modelId: model.id, reasoning: { effort: "high" } },
      }),
    });

    expect(response.status).toBe(201);
    expect(state.inserted).toMatchObject({
      modelId: model.id,
      reasoning: { effort: "high" },
    });
  });

  it("uses the first configured model and enabled default reasoning when omitted", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });

    expect(response.status).toBe(201);
    expect(state.inserted).toMatchObject({
      modelId: model.id,
      reasoning: { effort: "low" },
    });
  });

  it("loads requested owned templates before starting the first planning turn", async () => {
    state.templateRows = [
      {
        id: "template-1",
        name: "Community",
        description: "A community layout",
        version: 2,
        structure: { channels: {}, roles: {} },
      },
    ];

    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPrompt: "Create a community server",
        templateIds: ["template-1"],
      }),
    });

    expect(response.status).toBe(201);
    expect(state.createdSession?.addTemplate).toHaveBeenCalledWith({
      id: "template-1",
      name: "Community",
      description: "A community layout",
      version: 2,
      structure: { channels: {}, roles: {} },
    });
  });

  it("rejects conversation creation when a requested template is unavailable", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userPrompt: "Create a community server",
        templateIds: ["missing-template"],
      }),
    });

    expect(response.status).toBe(404);
    expect(state.inserted).toBeUndefined();
    expect(state.createdSession).toBeUndefined();
  });

  it("uses a persisted model without reasoning defaults when catalog metadata is unavailable", async () => {
    state.catalogFailure = true;

    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });

    expect(response.status).toBe(201);
    expect(state.inserted).toMatchObject({ modelId: model.id, reasoning: undefined });
  });

  it("gives a planning session a callback that revalidates the persisted model configuration", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });
    expect(response.status).toBe(201);

    state.conversationRows = [
      { id: "conversation-1", modelId: model.id, reasoning: { effort: "low" } },
    ];
    const getModelConfig = state.sessionOptions?.getModelConfig as
      | (() => Promise<unknown>)
      | undefined;
    expect(getModelConfig).toBeDefined();
    await expect(getModelConfig!()).resolves.toEqual({
      modelId: model.id,
      reasoning: { effort: "low" },
    });

    state.conversationRows = [
      { id: "conversation-1", modelId: model.id, reasoning: { effort: "high" } },
    ];
    await expect(getModelConfig!()).resolves.toEqual({
      modelId: model.id,
      reasoning: { effort: "high" },
    });
  });

  it("rejects a saved model removed from the deployment allowlist before a planning turn", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });
    expect(response.status).toBe(201);

    state.conversationRows = [{ id: "conversation-1", modelId: model.id }];
    state.settingRows = [{ value: ["fallback/model"] }];
    const getModelConfig = state.sessionOptions?.getModelConfig as
      | (() => Promise<unknown>)
      | undefined;

    await expect(getModelConfig!()).rejects.toThrow('Model "openai/tool-model" is not enabled');
  });

  it("rejects a removed saved model without fetching the OpenRouter catalog", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });
    expect(response.status).toBe(201);

    state.conversationRows = [{ id: "conversation-1", modelId: model.id }];
    state.settingRows = [{ value: ["fallback/model"] }];
    state.catalogCalls = 0;
    const getModelConfig = state.sessionOptions?.getModelConfig as
      | (() => Promise<unknown>)
      | undefined;

    await expect(getModelConfig!()).rejects.toThrow('Model "openai/tool-model" is not enabled');
    expect(state.catalogCalls).toBe(0);
  });

  it("fails the planning turn when its model configuration lookup fails", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userPrompt: "Create a staff channel" }),
    });
    expect(response.status).toBe(201);

    state.conversationLookupError = new Error("database unavailable");
    const getModelConfig = state.sessionOptions?.getModelConfig as
      | (() => Promise<unknown>)
      | undefined;

    await expect(getModelConfig!()).rejects.toThrow("database unavailable");
  });

  it("does not expose assistant reasoning or model provenance when fetching a conversation", async () => {
    state.conversationRows = [
      {
        id: "conversation-1",
        guildId: "guild-1",
        messages: [
          {
            role: "assistant",
            content: "Public response",
            modelId: "model-internal",
            reasoning: "private reasoning",
            reasoning_details: [{ text: "private detail" }],
          },
        ],
      },
    ];

    const response = await makeApp().request("/guilds/guild-1/conversations/conversation-1");

    expect(response.status).toBe(200);
    const body = (await response.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([{ role: "assistant", content: "Public response" }]);
    expect(JSON.stringify(body)).not.toContain("private reasoning");
    expect(JSON.stringify(body)).not.toContain("private detail");
    expect(JSON.stringify(body)).not.toContain("model-internal");
  });

  it("updates a conversation model configuration without changing its session", async () => {
    state.conversationRows = [{ id: "conversation-1", guildId: "guild-1", status: "planning" }];

    const response = await makeApp().request(
      "/guilds/guild-1/conversations/conversation-1/model-config",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, reasoning: { effort: "high" } }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      modelId: model.id,
      reasoning: { effort: "high" },
    });
    expect(state.updated).toMatchObject({
      modelId: model.id,
      reasoning: { effort: "high" },
    });
  });

  it("rejects model configuration updates without guild access", async () => {
    state.allowed = false;

    const response = await makeApp().request(
      "/guilds/guild-1/conversations/conversation-1/model-config",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id }),
      }
    );

    expect(response.status).toBe(403);
    expect(state.updated).toBeUndefined();
  });

  it("rejects model configuration updates for unknown conversations", async () => {
    const response = await makeApp().request("/guilds/guild-1/conversations/missing/model-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: model.id }),
    });

    expect(response.status).toBe(404);
    expect(state.updated).toBeUndefined();
  });

  it("rejects a model that is not configured for the deployment", async () => {
    state.conversationRows = [{ id: "conversation-1", guildId: "guild-1" }];

    const response = await makeApp().request(
      "/guilds/guild-1/conversations/conversation-1/model-config",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: "unknown/model" }),
      }
    );

    expect(response.status).toBe(400);
    expect(state.updated).toBeUndefined();
  });

  it("loads an owned template structure before adding it to planning context", async () => {
    state.conversationRows = [{ id: "conversation-1", guildId: "guild-1", status: "completed" }];
    state.templateRows = [
      {
        id: "template-1",
        authorId: "user-1",
        name: "Community",
        description: "Community baseline",
        version: 4,
        structure: { channels: { $ch_1: { name: "general" } } },
      },
    ];
    state.activeSession = { addTemplate: vi.fn() };

    const response = await makeApp().request(
      "/guilds/guild-1/conversations/conversation-1/templates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "template-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(state.activeSession.addTemplate).toHaveBeenCalledWith({
      id: "template-1",
      name: "Community",
      description: "Community baseline",
      version: 4,
      structure: { channels: { $ch_1: { name: "general" } } },
    });
  });

  it("does not expose another creator's template to planning context", async () => {
    state.conversationRows = [{ id: "conversation-1", guildId: "guild-1", status: "completed" }];
    state.templateRows = [];
    state.activeSession = { addTemplate: vi.fn() };

    const response = await makeApp().request(
      "/guilds/guild-1/conversations/conversation-1/templates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: "other-template" }),
      }
    );

    expect(response.status).toBe(404);
    expect(state.activeSession.addTemplate).not.toHaveBeenCalled();
  });
});
