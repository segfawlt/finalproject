import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, templateAuthoringTurns, templateVersions, templates } from "@repo/db";
import { requireUser } from "../../auth/middleware";
import type { AppVariables } from "../../types";
import {
  commitTemplateStructure,
  createTemplate,
  forkTemplate,
  revertTemplateVersion,
  TemplateVersionConflictError,
  updateTemplateMetadata,
} from "../../templates/template-version-service";
import { toTemplateDesiredState, fromTemplateDesiredState } from "../../templates/template-state";
import { TemplateSession } from "../../planning/template-session";
import { resolveDeploymentModelConfig } from "../../planning/deployment-model-config";
import type { ConversationModelConfig } from "../../planning/model-config";
import {
  getTemplateSession,
  removeTemplateSession,
  setTemplateSession,
} from "../../planning/template-session-manager";
import { emitTemplateEvent, subscribeToTemplate } from "../../planning/template-event-bus";

const templatesApp = new Hono<{ Variables: AppVariables }>();

const listQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).default("Untitled template"),
  description: z.string().default(""),
  category: z.string().trim().optional(),
  structure: z.record(z.unknown()).optional(),
});

const metadataSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const structureSchema = z.object({
  structure: z.record(z.unknown()),
  expectedVersion: z.number().int().positive(),
});

const revertSchema = z.object({ expectedVersion: z.number().int().positive() });
const versionParamSchema = z.object({ version: z.coerce.number().int().positive() });
const answerSchema = z.object({ answer: z.string().min(1) });
const modelConfigSchema = z.object({
  modelId: z.string().min(1),
  reasoning: z
    .object({
      effort: z.string().min(1).optional(),
      maxTokens: z.number().int().positive().optional(),
    })
    .optional(),
});
const authoringTurnSchema = z.object({
  prompt: z.string().min(1),
  modelConfig: modelConfigSchema.optional(),
});

async function ownedTemplate(id: string, authorId: string) {
  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.authorId, authorId)));
  return template;
}

async function ownedTurn(templateId: string, turnId: string, authorId: string) {
  const [turn] = await db
    .select()
    .from(templateAuthoringTurns)
    .where(
      and(
        eq(templateAuthoringTurns.id, turnId),
        eq(templateAuthoringTurns.templateId, templateId),
        eq(templateAuthoringTurns.authorId, authorId)
      )
    );
  return turn;
}

async function persistTurn(turnId: string, session: TemplateSession, status: string, extra = {}) {
  await db
    .update(templateAuthoringTurns)
    .set({
      status,
      messages: session.getMessages() as unknown as Record<string, unknown>[],
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(templateAuthoringTurns.id, turnId));
}

import type { Context } from "hono";

function conflictResponse(c: Context<{ Variables: AppVariables }>, error: unknown) {
  if (error instanceof TemplateVersionConflictError) {
    return c.json(
      { error: "Template version conflict", currentVersion: error.currentVersion },
      409
    );
  }
  throw error;
}

templatesApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = requireUser(c);
  const query = c.req.valid("query");
  let result = await db.select().from(templates).where(eq(templates.authorId, user.id));
  if (query.category) result = result.filter((template) => template.category === query.category);
  if (query.search) {
    const search = query.search.toLowerCase();
    result = result.filter(
      (template) =>
        template.name.toLowerCase().includes(search) ||
        template.description.toLowerCase().includes(search)
    );
  }
  return c.json(result);
});

templatesApp.post("/", zValidator("json", createTemplateSchema), async (c) => {
  if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
  const user = requireUser(c);
  const body = c.req.valid("json");
  const template = await createTemplate({ ...body, id: randomUUID(), authorId: user.id });
  return c.json(template, 201);
});

templatesApp.get("/:templateId", async (c) => {
  const template = await ownedTemplate(c.req.param("templateId"), requireUser(c).id);
  return template ? c.json(template) : c.json({ error: "Template not found" }, 404);
});

templatesApp.patch("/:templateId", zValidator("json", metadataSchema), async (c) => {
  if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
  const user = requireUser(c);
  const template = await updateTemplateMetadata(
    c.req.param("templateId"),
    user.id,
    c.req.valid("json")
  );
  return template ? c.json(template) : c.json({ error: "Template not found" }, 404);
});

templatesApp.delete("/:templateId", async (c) => {
  if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
  const user = requireUser(c);
  const template = await ownedTemplate(c.req.param("templateId"), user.id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  await db.delete(templates).where(eq(templates.id, template.id));
  return c.body(null, 204);
});

templatesApp.post("/:templateId/fork", async (c) => {
  if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
  const user = requireUser(c);
  const template = await forkTemplate({
    templateId: c.req.param("templateId"),
    authorId: user.id,
    id: randomUUID(),
  });
  return template ? c.json(template, 201) : c.json({ error: "Template not found" }, 404);
});

templatesApp.get("/:templateId/versions", async (c) => {
  const template = await ownedTemplate(c.req.param("templateId"), requireUser(c).id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json(
    await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, template.id))
      .orderBy(desc(templateVersions.version))
  );
});

templatesApp.get("/:templateId/versions/:version", async (c) => {
  const parsedVersion = versionParamSchema.safeParse({ version: c.req.param("version") });
  if (!parsedVersion.success) return c.json({ error: "Invalid template version" }, 400);
  const template = await ownedTemplate(c.req.param("templateId"), requireUser(c).id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  const [version] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, template.id),
        eq(templateVersions.version, parsedVersion.data.version)
      )
    );
  return version ? c.json(version) : c.json({ error: "Template version not found" }, 404);
});

templatesApp.post("/:templateId/versions", zValidator("json", structureSchema), async (c) => {
  if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
  const user = requireUser(c);
  try {
    const template = await commitTemplateStructure({
      templateId: c.req.param("templateId"),
      authorId: user.id,
      source: "manual",
      ...c.req.valid("json"),
    });
    return template ? c.json(template) : c.json({ error: "Template not found" }, 404);
  } catch (error) {
    return conflictResponse(c, error);
  }
});

templatesApp.post(
  "/:templateId/versions/:version/revert",
  zValidator("json", revertSchema),
  async (c) => {
    if (c.req.param("guildId")) return c.json({ error: "Template not found" }, 404);
    const parsedVersion = versionParamSchema.safeParse({ version: c.req.param("version") });
    if (!parsedVersion.success) return c.json({ error: "Invalid template version" }, 400);
    const user = requireUser(c);
    try {
      const template = await revertTemplateVersion({
        templateId: c.req.param("templateId"),
        authorId: user.id,
        version: parsedVersion.data.version,
        ...c.req.valid("json"),
      });
      return template ? c.json(template) : c.json({ error: "Template not found" }, 404);
    } catch (error) {
      return conflictResponse(c, error);
    }
  }
);

templatesApp.get("/:templateId/turns", async (c) => {
  const template = await ownedTemplate(c.req.param("templateId"), requireUser(c).id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  return c.json(
    await db
      .select()
      .from(templateAuthoringTurns)
      .where(
        and(
          eq(templateAuthoringTurns.templateId, template.id),
          eq(templateAuthoringTurns.authorId, template.authorId)
        )
      )
      .orderBy(desc(templateAuthoringTurns.createdAt))
  );
});

templatesApp.post("/:templateId/turns", zValidator("json", authoringTurnSchema), async (c) => {
  const user = requireUser(c);
  const template = await ownedTemplate(c.req.param("templateId"), user.id);
  if (!template) return c.json({ error: "Template not found" }, 404);
  const body = c.req.valid("json");
  let modelConfig: ConversationModelConfig | undefined;
  if (body.modelConfig) {
    try {
      modelConfig = await resolveDeploymentModelConfig(body.modelConfig);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Invalid model configuration" },
        400
      );
    }
  }
  const [latest] = await db
    .select()
    .from(templateAuthoringTurns)
    .where(
      and(
        eq(templateAuthoringTurns.templateId, template.id),
        eq(templateAuthoringTurns.authorId, user.id)
      )
    )
    .orderBy(desc(templateAuthoringTurns.createdAt));
  const turnId = randomUUID();
  const [turn] = await db
    .insert(templateAuthoringTurns)
    .values({
      id: turnId,
      templateId: template.id,
      authorId: user.id,
      prompt: body.prompt,
      baseVersion: template.version,
      messages: [
        ...((latest?.messages ?? []) as Record<string, unknown>[]),
        { role: "user", content: body.prompt },
      ],
      status: "planning",
    })
    .returning();
  const initialState = toTemplateDesiredState(
    template.id,
    template.name,
    template.version,
    template.structure
  );
  const session = new TemplateSession({
    templateId: template.id,
    turnId,
    creatorId: user.id,
    prompt: body.prompt,
    initialState,
    modelConfig,
    messages: (latest?.messages ?? []) as never,
    emit: async (event) => {
      if (event.type === "ask_user") await persistTurn(turnId, session, "waiting_for_user");
      if (event.type === "error") {
        await persistTurn(turnId, session, "error", { error: event.error });
      }
      emitTemplateEvent(turnId, event);
    },
    onStateChange: async (current) => {
      await persistTurn(turnId, current, current.status);
    },
    onComplete: async (current, changed) => {
      if (changed) {
        await commitTemplateStructure({
          templateId: template.id,
          authorId: user.id,
          structure: fromTemplateDesiredState(current.getDesiredState()),
          expectedVersion: template.version,
          source: "ai",
          authoringTurnId: turnId,
        });
      }
      await persistTurn(turnId, current, "completed", {
        summary: current.lastSummary,
        error: null,
      });
    },
  });
  setTemplateSession(turnId, user.id, template.id, session);
  void session
    .start()
    .catch(() => undefined)
    .finally(() => {
      if (["completed", "error", "cancelled"].includes(session.status)) {
        removeTemplateSession(turnId, user.id, template.id);
      }
    });
  return c.json(turn, 202);
});

templatesApp.get("/:templateId/turns/:turnId/stream", async (c) => {
  const user = requireUser(c);
  const turn = await ownedTurn(c.req.param("templateId"), c.req.param("turnId"), user.id);
  if (!turn) return c.json({ error: "Template turn not found" }, 404);
  return streamSSE(c, async (stream) => {
    const turnId = turn.id;
    let terminalDelivered = false;
    await stream.writeSSE({
      event: "status",
      data: JSON.stringify({ turnId, status: "streaming_ready" }),
    });
    const unsubscribe = subscribeToTemplate(turnId, (event) => {
      if (["completed", "error", "cancelled", "expired"].includes(event.type)) {
        terminalDelivered = true;
      }
      void stream.writeSSE({
        event: event.type,
        data: JSON.stringify({
          turnId,
          toolName: event.toolName,
          params: event.params,
          result: event.result,
          question: event.question,
          options: event.options,
          multiSelect: event.multiSelect,
          allowCustom: event.allowCustom,
          summary: event.summary,
          error: event.error,
        }),
      });
    });
    if (!terminalDelivered) {
      const terminalEvent = persistedTerminalEvent(turn);
      if (terminalEvent) {
        await stream.writeSSE({
          event: terminalEvent.type,
          data: JSON.stringify({ turnId, ...terminalEvent }),
        });
      }
    }
    stream.onAbort(unsubscribe);
    while (!stream.aborted) {
      await stream.sleep(30000);
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }
    unsubscribe();
  });
});

templatesApp.post(
  "/:templateId/turns/:turnId/answer",
  zValidator("json", answerSchema),
  async (c) => {
    const user = requireUser(c);
    const templateId = c.req.param("templateId");
    const turnId = c.req.param("turnId");
    const turn = await ownedTurn(templateId, turnId, user.id);
    if (!turn) return c.json({ error: "Template turn not found" }, 404);
    const session = getTemplateSession(turnId, user.id, templateId);
    if (!session) return c.json({ error: "Template turn is not active" }, 404);
    await db
      .update(templateAuthoringTurns)
      .set({ status: "planning", updatedAt: new Date() })
      .where(eq(templateAuthoringTurns.id, turnId));
    await session.resume(c.req.valid("json").answer);
    return c.json({ resumed: true });
  }
);

function persistedTerminalEvent(turn: {
  status: string;
  summary?: string | null;
  error?: string | null;
}) {
  if (turn.status === "completed")
    return { type: "completed" as const, summary: turn.summary ?? "" };
  if (turn.status === "error")
    return { type: "error" as const, error: turn.error ?? "Template planning failed" };
  if (turn.status === "cancelled") return { type: "cancelled" as const };
  if (turn.status === "expired") return { type: "expired" as const };
  return undefined;
}

templatesApp.post("/:templateId/turns/:turnId/cancel", async (c) => {
  const user = requireUser(c);
  const templateId = c.req.param("templateId");
  const turnId = c.req.param("turnId");
  const turn = await ownedTurn(templateId, turnId, user.id);
  if (!turn) return c.json({ error: "Template turn not found" }, 404);
  const session = getTemplateSession(turnId, user.id, templateId);
  if (session) {
    session.cancel();
    await persistTurn(turnId, session, "cancelled");
    emitTemplateEvent(turnId, { type: "cancelled" });
    removeTemplateSession(turnId, user.id, templateId);
  } else {
    await db
      .update(templateAuthoringTurns)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(templateAuthoringTurns.id, turnId));
    emitTemplateEvent(turnId, { type: "cancelled" });
  }
  return c.json({ cancelled: true });
});

templatesApp.post("/:templateId/merge", (c) =>
  c.json({ error: "Template merge is no longer supported." }, 410)
);

export default templatesApp;
