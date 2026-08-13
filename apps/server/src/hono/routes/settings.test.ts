import { describe, expect, it, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AppVariables } from "../../types";

const state = vi.hoisted(() => ({
  settingsRows: [] as Array<{ value: unknown }>,
  catalog: [] as Array<Record<string, unknown>>,
  catalogFailure: false,
  inserted: undefined as Record<string, unknown> | undefined,
  updated: undefined as Record<string, unknown> | undefined,
  upsert: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@repo/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => state.settingsRows,
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        state.inserted = values;
        return {
          onConflictDoUpdate: async (config: Record<string, unknown>) => {
            state.upsert = config;
          },
        };
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.updated = values;
        },
      }),
    }),
  },
  appSettings: { key: "key" },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
}));

vi.mock("../../env-validated", () => ({
  validatedEnv: {
    LLM_BASE_URL: "https://openrouter.ai/api/v1",
    LLM_API_KEY: "server-secret",
    LLM_MODEL: "fallback/model",
  },
}));

vi.mock("../../planning/openrouter-models", () => ({
  getOpenRouterModels: vi.fn(async () => {
    if (state.catalogFailure) throw new Error("OpenRouter unavailable");
    return state.catalog;
  }),
}));

import settingsApp from "./settings";

function makeApp(authenticated = true) {
  const app = new Hono<{ Variables: AppVariables }>();
  if (authenticated) {
    app.use("*", async (c, next) => {
      c.set("user", { id: "user-1" } as AppVariables["user"]);
      await next();
    });
  }
  app.route("/settings", settingsApp);
  return app;
}

const toolModel = {
  id: "openai/tool-model",
  name: "Tool model",
  description: "Can call tools",
  supportsTools: true,
};

describe("settings models routes", () => {
  beforeEach(() => {
    state.settingsRows = [];
    state.catalog = [];
    state.catalogFailure = false;
    state.inserted = undefined;
    state.updated = undefined;
    state.upsert = undefined;
  });

  it("requires an authenticated user", async () => {
    const response = await makeApp(false).request("/settings/models");

    expect(response.status).toBe(401);
  });

  it("mounts the settings route under /api/settings", () => {
    const appSource = readFileSync(fileURLToPath(new URL("../app.ts", import.meta.url)), "utf8");

    expect(appSource).toContain('api.route("/settings", settingsApp);');
  });

  it("returns the configured fallback and a fallback catalog entry when the catalog is unavailable", async () => {
    const response = await makeApp().request("/settings/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      modelIds: ["fallback/model"],
      models: [
        {
          id: "fallback/model",
          name: "fallback/model",
          description: "",
          supportsTools: true,
        },
      ],
    });
  });

  it("returns the configured fallback when catalog fetching fails", async () => {
    state.catalogFailure = true;

    const response = await makeApp().request("/settings/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      modelIds: ["fallback/model"],
      models: [expect.objectContaining({ id: "fallback/model" })],
    });
  });

  it("saves one or two current tool-capable catalog models with an atomic upsert", async () => {
    state.catalog = [toolModel];

    const response = await makeApp().request("/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: ["openai/tool-model"] }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      modelIds: ["openai/tool-model"],
      models: [toolModel],
    });
    expect(state.inserted).toEqual({ key: "openrouter_models", value: ["openai/tool-model"] });
    expect(state.upsert).toMatchObject({
      target: "key",
      set: { value: ["openai/tool-model"] },
    });
    expect(state.upsert?.set).toHaveProperty("updatedAt");
  });

  it("rejects more than two model IDs", async () => {
    state.catalog = [toolModel];

    const response = await makeApp().request("/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: ["a", "b", "c"] }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate model IDs", async () => {
    state.catalog = [toolModel];

    const response = await makeApp().request("/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: ["openai/tool-model", "openai/tool-model"] }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects IDs missing from the current catalog", async () => {
    state.catalog = [toolModel];

    const response = await makeApp().request("/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: ["unknown/model"] }),
    });

    expect(response.status).toBe(400);
  });

  it("rejects catalog models without tool support", async () => {
    state.catalog = [{ ...toolModel, id: "openai/no-tools", supportsTools: false }];

    const response = await makeApp().request("/settings/models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: ["openai/no-tools"] }),
    });

    expect(response.status).toBe(400);
  });
});
