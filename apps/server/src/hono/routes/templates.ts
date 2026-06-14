import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, templates, conversations, planIterations } from "@repo/db";
import { eq, or } from "drizzle-orm";
import { userHasManageGuild } from "../../auth/helpers";
import { requireUser } from "../../auth/middleware";
import type { AppVariables } from "../../types";
import { hashServerState } from "@repo/shared";
import { PlanningSession } from "../../planning/planning-session";
import {
  getSession,
  setSession,
  removeSession,
  setSessionTimeout,
} from "../../planning/session-manager";
import { emitConversationEvent } from "../../planning/planning-event-bus";
import { logger } from "../../utils/logger";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import type { ServerState } from "@repo/shared";

const templatesApp = new Hono<{ Variables: AppVariables }>();

const listQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

const createSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  structure: z.record(z.unknown()),
  questions: z.array(z.record(z.unknown())).optional().default([]),
  validationRules: z.array(z.record(z.unknown())).optional().default([]),
  category: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
});

templatesApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const guildId = c.req.param("guildId")!;

  let result = await db
    .select()
    .from(templates)
    .where(or(eq(templates.guildId, guildId), eq(templates.guildId, null as unknown as string)));

  if (query.category) {
    result = result.filter((t) => t.category === query.category);
  }

  if (query.search) {
    const searchLower = query.search.toLowerCase();
    result = result.filter(
      (t) =>
        t.name.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower)
    );
  }

  return c.json(result);
});

templatesApp.get("/:templateId", async (c) => {
  const guildId = c.req.param("guildId")!;
  const templateId = c.req.param("templateId")!;

  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (template.guildId && template.guildId !== guildId) {
    return c.json({ error: "Template not found" }, 404);
  }

  return c.json(template);
});

templatesApp.post("/", zValidator("json", createSchema), async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const data = {
    ...body,
    guildId,
    authorId: user.id,
    status: "draft" as const,
  };

  const [template] = await db.insert(templates).values(data).returning();
  return c.json(template, 201);
});

templatesApp.put("/:templateId", zValidator("json", createSchema.partial()), async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const templateId = c.req.param("templateId")!;
  const body = c.req.valid("json");

  const [existing] = await db.select().from(templates).where(eq(templates.id, templateId));

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (existing.guildId !== guildId) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (existing.authorId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updateData = {
    ...body,
    version: (existing.version ?? 0) + 1,
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(templates)
    .set(updateData)
    .where(eq(templates.id, templateId))
    .returning();

  return c.json(updated);
});

templatesApp.delete("/:templateId", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const templateId = c.req.param("templateId")!;

  const [existing] = await db.select().from(templates).where(eq(templates.id, templateId));

  if (!existing) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (existing.guildId !== guildId) {
    return c.json({ error: "Template not found" }, 404);
  }

  if (existing.authorId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db.delete(templates).where(eq(templates.id, templateId));

  return c.json({ deleted: true });
});

function buildServerState(guildId: string): ServerState {
  const cache = guildCache.get(guildId);
  const guild = botClient.guilds.cache.get(guildId);
  return {
    guildId,
    guildName: guild?.name ?? guildId,
    memberCount: guild?.memberCount ?? 0,
    channels: cache ? Array.from(cache.channels.values()) : [],
    roles: cache ? Array.from(cache.roles.values()) : [],
    overwrites: cache ? Array.from(cache.permissions.values()) : [],
    memberRoles: cache
      ? Array.from(cache.members.values()).map((m) => ({
          memberId: m.id,
          roleIds: m.roleIds,
        }))
      : [],
  };
}

templatesApp.post("/:templateId/merge", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const templateId = c.req.param("templateId")!;

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Load template
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Build prompt from template data
  const structureText = JSON.stringify(template.structure, null, 2);
  const userPrompt =
    `Apply the "${template.name}" template to this server.\n\n` +
    `Template description: ${template.description}\n\n` +
    `Template structure:\n${structureText}\n\n` +
    "Instructions:\n" +
    "- Compare the template against the current server state\n" +
    "- Adapt the template: rename items if names conflict, skip items " +
    "that already exist with the right configuration\n" +
    "- Use ask_user if you need clarification about which existing " +
    "resources to reuse or rename\n" +
    "- Preserve the template's intent even if exact names differ";

  // Build server state and compute fork hash
  const serverState = buildServerState(guildId);
  const forkStateHash = hashServerState(serverState as unknown as Record<string, unknown>);

  // Insert conversation
  const [conversation] = await db
    .insert(conversations)
    .values({
      guildId,
      userId: user.id,
      status: "planning",
      userPrompt,
      messages: [],
      forkStateHash,
    })
    .returning();

  // Create planning session (same pattern as POST /conversations)
  const ASK_USER_TIMEOUT_MS = 2 * 60 * 1000;

  const session = new PlanningSession({
    guildId,
    conversationId: conversation.id,
    userPrompt,
    serverState,
    forkStateHash,
    emit: async (event) => {
      emitConversationEvent(conversation.id, event);

      if (event.type === "ask_user") {
        const timeout = setTimeout(async () => {
          const s = getSession(conversation.id);
          if (s) {
            s.cancel();
            removeSession(conversation.id);
            emitConversationEvent(conversation.id, {
              type: "expired",
              error: "Ask user response timed out after 2 minutes",
            });
            await db
              .update(conversations)
              .set({ status: "expired", updatedAt: new Date() })
              .where(eq(conversations.id, conversation.id));
          }
        }, ASK_USER_TIMEOUT_MS);
        setSessionTimeout(conversation.id, timeout);
        await db
          .update(conversations)
          .set({ status: "waiting_for_user", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }

      if (event.type === "completed") {
        removeSession(conversation.id);
        await db
          .update(conversations)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }

      if (event.type === "error") {
        removeSession(conversation.id);
        await db
          .update(conversations)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }
    },
    onTurnComplete: async (sess) => {
      const snapshot = sess.store.snapshot();
      const version = sess.store.getState().version;

      await db.insert(planIterations).values({
        conversationId: conversation.id,
        version,
        type: "llm_generated",
        desiredState: snapshot as unknown as Record<string, unknown>,
      });

      sess.store.getState().version += 1;

      await db
        .update(conversations)
        .set({
          messages: sess.getMessages() as unknown as Record<string, unknown>[],
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
    },
  });

  setSession(conversation.id, session);

  session.start().catch((err) => {
    logger.error(err, "[templates] Planning session error");
    removeSession(conversation.id);
  });

  return c.json({ conversationId: conversation.id }, 201);
});

export default templatesApp;
