import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { AppVariables } from "../../types";

const state = vi.hoisted(() => ({
  templates: [] as Array<Record<string, unknown>>,
  versions: [] as Array<Record<string, unknown>>,
  turns: [] as Array<Record<string, unknown>>,
  templateTable: { id: "id", authorId: "authorId" },
  versionTable: { templateId: "templateId", version: "version" },
  turnTable: { id: "id", templateId: "templateId", authorId: "authorId", createdAt: "createdAt" },
  created: undefined as Record<string, unknown> | undefined,
  metadata: undefined as Record<string, unknown> | undefined,
  committed: undefined as Record<string, unknown> | undefined,
  updates: [] as Array<Record<string, unknown>>,
  forked: undefined as Record<string, unknown> | undefined,
  reverted: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@repo/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition?: { right?: unknown } | Array<{ right?: unknown }>) => {
          const rows =
            table === state.versionTable
              ? state.versions
              : table === state.turnTable
                ? state.turns
                : state.templates;
          const conditions = Array.isArray(condition) ? condition : condition ? [condition] : [];
          const filtered = rows.filter((row) =>
            conditions.every(
              (item) =>
                item.right === undefined ||
                row.authorId === item.right ||
                row.id === item.right ||
                row.templateId === item.right ||
                row.version === item.right
            )
          );
          return {
            orderBy: async () => filtered,
            then: (resolve: (value: Array<Record<string, unknown>>) => unknown) =>
              Promise.resolve(resolve(filtered)),
          };
        },
      }),
    }),
    delete: () => ({
      where: async () => undefined,
    }),
    insert: (table: unknown) => ({
      values: (value: Record<string, unknown>) => ({
        returning: async () => {
          if (table === state.turnTable) {
            state.turns.push(value);
            return [value];
          }
          return [value];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async (condition?: { right?: unknown }) => {
          state.updates.push(values);
          if (condition?.right !== undefined) {
            for (const row of state.turns) {
              if (row.id === condition.right) Object.assign(row, values);
            }
          }
        },
      }),
    }),
    templates: state.templateTable,
    templateVersions: state.versionTable,
    templateAuthoringTurns: state.turnTable,
  },
  templates: state.templateTable,
  templateVersions: state.versionTable,
  templateAuthoringTurns: state.turnTable,
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  desc: (value: unknown) => value,
  eq: (left: unknown, right: unknown) => ({ left, right }),
}));

vi.mock("../../templates/template-version-service", () => ({
  createTemplate: vi.fn(async (input: Record<string, unknown>) => {
    state.created = input;
    return { id: input.id, authorId: input.authorId, version: 1, structure: input.structure };
  }),
  forkTemplate: vi.fn(async (input: Record<string, unknown>) => {
    state.forked = input;
    return { id: input.id, authorId: input.authorId, version: 1 };
  }),
  updateTemplateMetadata: vi.fn(async (id: string, authorId: string, metadata: unknown) => {
    state.metadata = { id, authorId, metadata };
    return { id, authorId, version: 1, ...(metadata as object) };
  }),
  commitTemplateStructure: vi.fn(
    async (input: { templateId: string; authorId: string; structure: unknown }) => {
      state.committed = input;
      return {
        id: input.templateId,
        authorId: input.authorId,
        version: 2,
        structure: input.structure,
      } as never;
    }
  ),
  revertTemplateVersion: vi.fn(async (input: Record<string, unknown>) => {
    state.reverted = input;
    return { id: input.templateId, authorId: input.authorId, version: 2 };
  }),
  TemplateVersionConflictError: class TemplateVersionConflictError extends Error {
    constructor(public readonly currentVersion: number) {
      super("conflict");
    }
  },
}));

const { resolveDeploymentModelConfig } = vi.hoisted(() => ({
  resolveDeploymentModelConfig: vi.fn(async (selection) => selection),
}));
vi.mock("../../planning/deployment-model-config", () => ({ resolveDeploymentModelConfig }));

import templatesApp from "./templates";
import {
  TemplateVersionConflictError,
  commitTemplateStructure,
} from "../../templates/template-version-service";
import { TemplateSession } from "../../planning/template-session";
import { setTemplateSession, removeTemplateSession } from "../../planning/template-session-manager";

function makeApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AppVariables["user"]);
    await next();
  });
  app.route("/templates", templatesApp);
  app.route("/guilds/:guildId/templates", templatesApp);
  return app;
}

describe("creator-scoped template lifecycle", () => {
  beforeEach(() => {
    state.templates = [];
    state.versions = [];
    state.turns = [];
    state.created = undefined;
    state.metadata = undefined;
    state.committed = undefined;
    state.updates = [];
    state.forked = undefined;
    state.reverted = undefined;
    vi.mocked(commitTemplateStructure).mockReset();
    vi.mocked(commitTemplateStructure).mockImplementation(async (input) => {
      state.committed = input as unknown as Record<string, unknown>;
      return undefined;
    });
    vi.mocked(resolveDeploymentModelConfig).mockClear();
  });

  it("lists only the authenticated creator's templates", async () => {
    state.templates = [
      {
        id: "owned",
        authorId: "user-1",
        description: "A moderated community",
        structure: { channels: { general: {} }, roles: { member: {} } },
        updatedAt: "2026-08-12T00:00:00.000Z",
      },
    ];
    const response = await makeApp().request("/templates");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(state.templates);
  });

  it("creates a server-identified seeded template", async () => {
    const response = await makeApp().request("/templates", {
      method: "POST",
      body: JSON.stringify({ name: "Starter", structure: { channels: {} }, category: "community" }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(201);
    expect(state.created).toMatchObject({
      authorId: "user-1",
      name: "Starter",
      structure: { channels: {} },
      category: "community",
    });
    expect(state.created?.id).toEqual(expect.any(String));
  });

  it("returns 404 for a non-owned detail", async () => {
    state.templates = [{ id: "other", authorId: "user-2" }];
    expect((await makeApp().request("/templates/other")).status).toBe(404);
  });

  it("delegates metadata patches without changing the version", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    const response = await makeApp().request("/templates/owned", {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(200);
    expect(state.metadata).toEqual({
      id: "owned",
      authorId: "user-1",
      metadata: { name: "Renamed" },
    });
  });

  it("maps structure conflicts to 409 with the current version", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    vi.mocked(commitTemplateStructure).mockRejectedValueOnce(new TemplateVersionConflictError(4));
    const response = await makeApp().request("/templates/owned/versions", {
      method: "POST",
      body: JSON.stringify({ structure: {}, expectedVersion: 2 }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Template version conflict",
      currentVersion: 4,
    });
  });

  it("supports fork, versions, revert, delete, and the guild read alias", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.versions = [{ templateId: "owned", version: 1 }];
    expect((await makeApp().request("/templates/owned/fork", { method: "POST" })).status).toBe(201);
    expect((await makeApp().request("/templates/owned/versions")).status).toBe(200);
    expect((await makeApp().request("/templates/owned/versions/1")).status).toBe(200);
    expect(
      (
        await makeApp().request("/templates/owned/versions/1/revert", {
          method: "POST",
          body: JSON.stringify({ expectedVersion: 1 }),
          headers: { "content-type": "application/json" },
        })
      ).status
    ).toBe(200);
    expect((await makeApp().request("/templates/owned", { method: "DELETE" })).status).toBe(204);
    expect((await makeApp().request("/guilds/g1/templates")).status).toBe(200);
  });

  it("rejects invalid version path parameters with 400", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];

    expect((await makeApp().request("/templates/owned/versions/not-an-integer")).status).toBe(400);
    expect(
      (
        await makeApp().request("/templates/owned/versions/0/revert", {
          method: "POST",
          body: JSON.stringify({ expectedVersion: 1 }),
          headers: { "content-type": "application/json" },
        })
      ).status
    ).toBe(400);
  });

  it("returns 404 for a valid but missing version", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.versions = [{ templateId: "owned", version: 1 }];

    expect((await makeApp().request("/templates/owned/versions/2")).status).toBe(404);
  });

  it("keeps merge retired", async () => {
    expect(
      (await makeApp().request("/guilds/g1/templates/owned/merge", { method: "POST" })).status
    ).toBe(410);
  });

  it("lists creator-owned authoring turns and hides non-owned turns", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.turns = [
      { id: "turn-1", templateId: "owned", authorId: "user-1" },
      { id: "turn-2", templateId: "owned", authorId: "user-2" },
    ];
    const response = await makeApp().request("/templates/owned/turns");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([state.turns[0]]);
    expect((await makeApp().request("/templates/other/turns")).status).toBe(404);
  });

  it("inserts a turn before starting authoring and returns 202", async () => {
    state.templates = [
      { id: "owned", authorId: "user-1", name: "Base", version: 3, structure: {} },
    ];
    const response = await makeApp().request("/templates/owned/turns", {
      method: "POST",
      body: JSON.stringify({ prompt: "Add a welcome channel" }),
      headers: { "content-type": "application/json" },
    });
    expect(response.status).toBe(202);
    expect(state.turns[0]).toMatchObject({
      templateId: "owned",
      authorId: "user-1",
      prompt: "Add a welcome channel",
      baseVersion: 3,
      status: "planning",
    });
  });

  it("validates and forwards the selected model for a template authoring turn", async () => {
    state.templates = [
      { id: "owned", authorId: "user-1", name: "Base", version: 3, structure: {} },
    ];
    const modelConfig = { modelId: "openai/gpt-4o-mini", reasoning: { effort: "high" } };

    const response = await makeApp().request("/templates/owned/turns", {
      method: "POST",
      body: JSON.stringify({ prompt: "Add a welcome channel", modelConfig }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(202);
    expect(resolveDeploymentModelConfig).toHaveBeenCalledWith(modelConfig);
  });

  it("returns 404 for a turn owned by another creator or another template", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.turns = [{ id: "turn-1", templateId: "other", authorId: "user-1" }];
    expect(
      (await makeApp().request("/templates/owned/turns/turn-1/cancel", { method: "POST" })).status
    ).toBe(404);
    state.turns[0] = { id: "turn-1", templateId: "owned", authorId: "user-2" };
    expect(
      (
        await makeApp().request("/templates/owned/turns/turn-1/answer", {
          method: "POST",
          body: JSON.stringify({ answer: "yes" }),
          headers: { "content-type": "application/json" },
        })
      ).status
    ).toBe(404);
  });

  it("resumes an active ask_user turn and persists planning status first", async () => {
    state.templates = [
      { id: "owned", authorId: "user-1", name: "Base", version: 1, structure: {} },
    ];
    state.turns = [
      { id: "turn-answer", templateId: "owned", authorId: "user-1", status: "waiting_for_user" },
    ];
    const session = new TemplateSession({
      templateId: "owned",
      turnId: "turn-answer",
      creatorId: "user-1",
      prompt: "Continue",
      initialState: {
        guildId: "owned",
        guildName: "Base",
        active: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
        tombstones: [],
        symbolCounter: 0,
        version: 1,
      },
      invokeLLM: vi.fn().mockResolvedValue({
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "question-1",
            type: "function",
            function: { name: "ask_user", arguments: JSON.stringify({ question: "Continue?" }) },
          },
        ],
      }),
      emit: vi.fn(),
      onStateChange: vi.fn(async () => {}),
      onComplete: vi.fn(async () => {}),
    });
    await session.start();
    setTemplateSession("turn-answer", "user-1", "owned", session);

    const response = await makeApp().request("/templates/owned/turns/turn-answer/answer", {
      method: "POST",
      body: JSON.stringify({ answer: "yes" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(state.updates[0]).toMatchObject({ status: "planning" });
    removeTemplateSession("turn-answer", "user-1", "owned");
  });

  it("persists cancellation and exposes it as a terminal SSE replay", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.turns = [{ id: "turn-1", templateId: "owned", authorId: "user-1", status: "planning" }];

    const cancel = await makeApp().request("/templates/owned/turns/turn-1/cancel", {
      method: "POST",
    });
    expect(cancel.status).toBe(200);
    expect(state.updates).toContainEqual(expect.objectContaining({ status: "cancelled" }));

    const stream = await makeApp().request("/templates/owned/turns/turn-1/stream");
    const reader = stream.body!.getReader();
    const first = await reader.read();
    const second = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value);
    expect(text).toContain("event: cancelled");
  });

  it("returns a persisted terminal error after a provider failure", async () => {
    state.templates = [{ id: "owned", authorId: "user-1" }];
    state.turns = [
      {
        id: "turn-error",
        templateId: "owned",
        authorId: "user-1",
        status: "error",
        error: "provider down",
      },
    ];

    const stream = await makeApp().request("/templates/owned/turns/turn-error/stream");
    const reader = stream.body!.getReader();
    const first = await reader.read();
    const second = await reader.read();
    await reader.cancel();
    const text = new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value);
    expect(text).toContain("event: error");
    expect(text).toContain("provider down");
  });
});
