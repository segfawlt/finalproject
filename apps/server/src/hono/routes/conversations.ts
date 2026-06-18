import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, conversations, planIterations, plans } from "@repo/db";
import { eq, desc, and } from "drizzle-orm";
import { hashServerState } from "@repo/shared";
import { userHasManageGuild } from "../../auth/helpers";
import { requireUser } from "../../auth/middleware";
import { checkGuildOperable } from "../../planning/guild-check";
import { isGuildLocked } from "../../planning/locking";
import { PlanningSession } from "../../planning/planning-session";
import {
  getSession,
  setSession,
  removeSession,
  setSessionTimeout,
  clearSessionTimeout,
} from "../../planning/session-manager";
import { emitConversationEvent } from "../../planning/planning-event-bus";
import { logger } from "../../utils/logger";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import type { AppVariables } from "../../types";
import type { ServerState, DesiredState } from "@repo/shared";

const conversationsApp = new Hono<{ Variables: AppVariables }>();

const ASK_USER_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// ── Shared helper ──────────────────────────────────────────────────────────

async function checkGuildAccess(
  c: { get: (key: string) => unknown },
  guildId: string
): Promise<{ allowed: true } | { allowed: false; status: number; error: string }> {
  const user = c.get("user") as { id: string } | undefined;
  if (!user) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return { allowed: false, status: operable.status, error: operable.error };
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return { allowed: false, status: 403, error: "Forbidden" };
  }

  return { allowed: true };
}

async function checkConversationNotStale(
  convId: string
): Promise<{ ok: true } | { ok: false; status: 404 | 409; error: string }> {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));
  if (!conv) return { ok: false, status: 404, error: "Conversation not found" };
  if (conv.status === "stale") {
    return {
      ok: false,
      status: 409,
      error: "Conversation is stale. Server state has changed. Start a new conversation.",
    };
  }
  return { ok: true };
}

async function checkGuildNotLocked(
  guildId: string
): Promise<{ ok: true } | { ok: false; status: 423; error: string }> {
  if (await isGuildLocked(guildId)) {
    return {
      ok: false,
      status: 423,
      error: "A plan is currently executing for this guild. Try again after it completes.",
    };
  }
  return { ok: true };
}

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

// ── List + Fetch (existing) ─────────────────────────────────────────────────

conversationsApp.get("/", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const result = await db
    .select({
      id: conversations.id,
      guildId: conversations.guildId,
      userId: conversations.userId,
      status: conversations.status,
      userPrompt: conversations.userPrompt,
      forkStateHash: conversations.forkStateHash,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.guildId, guildId))
    .orderBy(desc(conversations.createdAt));

  return c.json(result);
});

conversationsApp.get("/:convId", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, convId));

  if (!conv || conv.guildId !== guildId) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const iterations = await db
    .select()
    .from(planIterations)
    .where(eq(planIterations.conversationId, convId))
    .orderBy(planIterations.version);

  return c.json({ ...conv, iterations });
});

// ── Create conversation + start planning ────────────────────────────────────

const createConversationSchema = z.object({
  userPrompt: z.string().min(1),
});

conversationsApp.post("/", zValidator("json", createConversationSchema), async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
  }

  // Build server state and compute fork hash
  const serverState = buildServerState(guildId);
  let forkStateHash: string;
  try {
    forkStateHash = hashServerState(serverState as unknown as Record<string, unknown>);
  } catch (err) {
    logger.error(err, "[conversations] hashServerState failed; cache likely empty");
    return c.json(
      { error: "Bot is still building its cache. Please retry in a few seconds." },
      503
    );
  }

  // Insert conversation row
  const [conversation] = await db
    .insert(conversations)
    .values({
      guildId,
      userId: user.id,
      status: "planning",
      userPrompt: body.userPrompt,
      messages: [],
      forkStateHash,
    })
    .returning();

  // Create and start planning session
  const session = new PlanningSession({
    guildId,
    conversationId: conversation.id,
    userPrompt: body.userPrompt,
    serverState,
    forkStateHash,
    emit: async (event) => {
      emitConversationEvent(conversation.id, event);

      if (event.type === "ask_user") {
        // Start 2-minute timeout
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

      // Bump version for next turn
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

  // Fire-and-forget — planning events flow through SSE
  session.start().catch((err) => {
    logger.error(err, "[conversations] Planning session error");
    removeSession(conversation.id);
  });

  return c.json(conversation, 201);
});

// ── Respond to ask_user ─────────────────────────────────────────────────────

const askUserSchema = z.object({
  answer: z.string().min(1),
});

conversationsApp.post("/:convId/ask-user", zValidator("json", askUserSchema), async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;
  const body = c.req.valid("json");

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const lockCheck = await checkGuildNotLocked(guildId);
  if (!lockCheck.ok) {
    return c.json({ error: lockCheck.error }, lockCheck.status);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "No active planning session for this conversation" }, 409);
  }

  if (session.status !== "waiting_for_user") {
    return c.json({ error: "Conversation is not waiting for user input" }, 400);
  }

  clearSessionTimeout(convId);

  await db
    .update(conversations)
    .set({ status: "planning", updatedAt: new Date() })
    .where(eq(conversations.id, convId));

  session.resume(body.answer).catch((err) => {
    logger.error(err, "[conversations] Resume error");
    removeSession(convId);
  });

  return c.json({ resumed: true });
});

// ── Cancel planning ─────────────────────────────────────────────────────────

conversationsApp.post("/:convId/cancel", async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "No active planning session for this conversation" }, 409);
  }

  clearSessionTimeout(convId);
  session.cancel();
  removeSession(convId);

  await db
    .update(conversations)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(conversations.id, convId));

  return c.json({ cancelled: true });
});

// ── Approve — create plan from final desired state ──────────────────────────

conversationsApp.post("/:convId/approve", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const lockCheck = await checkGuildNotLocked(guildId);
  if (!lockCheck.ok) {
    return c.json({ error: lockCheck.error }, lockCheck.status);
  }

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, convId));

  if (!conversation || conversation.guildId !== guildId) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "No active planning session for this conversation" }, 409);
  }

  if (session.status !== "completed") {
    return c.json({ error: "Planning session not completed" }, 400);
  }

  // Snapshot the latest iteration's desiredState so execution uses the approved contract
  const [latestIteration] = await db
    .select()
    .from(planIterations)
    .where(eq(planIterations.conversationId, convId))
    .orderBy(desc(planIterations.version))
    .limit(1);

  const planData = {
    llmResponse: {
      summary: session.lastSummary,
      reasoning: session.lastReasoning,
    },
    desiredState: latestIteration?.desiredState ?? undefined,
  };

  const [plan] = await db
    .insert(plans)
    .values({
      guildId,
      userId: user?.id ?? "system",
      conversationId: convId,
      status: "draft",
      userPrompt: conversation.userPrompt,
      planData: planData as unknown as Record<string, unknown>,
    })
    .returning();

  return c.json({ planId: plan.id });
});

// ── Revise — continue conversation with a new prompt ──────────────────────

const reviseSchema = z.object({
  prompt: z.string().min(1),
});

conversationsApp.post("/:convId/revise", zValidator("json", reviseSchema), async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;
  const body = c.req.valid("json");

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const lockCheck = await checkGuildNotLocked(guildId);
  if (!lockCheck.ok) {
    return c.json({ error: lockCheck.error }, lockCheck.status);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "No active planning session for this conversation" }, 409);
  }

  if (session.status !== "completed") {
    return c.json({ error: "Planning session not completed" }, 400);
  }

  await db
    .update(conversations)
    .set({ status: "planning", updatedAt: new Date() })
    .where(eq(conversations.id, convId));

  session.revise(body.prompt).catch((err) => {
    logger.error(err, "[conversations] Revise error");
    removeSession(convId);
  });

  return c.json({ revised: true });
});

// ── Revert to past iteration ─────────────────────────────────────────────────

conversationsApp.post("/:convId/revert/:version", async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;
  const version = Number(c.req.param("version"));

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const lockCheck = await checkGuildNotLocked(guildId);
  if (!lockCheck.ok) {
    return c.json({ error: lockCheck.error }, lockCheck.status);
  }

  // Load the target iteration
  const [iteration] = await db
    .select()
    .from(planIterations)
    .where(and(eq(planIterations.conversationId, convId), eq(planIterations.version, version)));

  if (!iteration) {
    return c.json({ error: "Iteration not found" }, 404);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "Conversation is not active. Start a new planning session." }, 409);
  }

  // Reject if the session is mid-turn — the LLM dispatch is mutating the
  // same store concurrently and a revert would clobber its in-progress work.
  if (session.status !== "completed" && session.status !== "waiting_for_user") {
    return c.json(
      {
        error:
          "Cannot revert while a planning turn is in progress. Wait for the current turn to finish or cancel the session.",
      },
      409
    );
  }

  // Revert store to the iteration's desiredState
  const desiredState = iteration.desiredState as unknown as import("@repo/shared").DesiredState;
  session.store.revert(desiredState);

  // Save new iteration marking the revert
  const newVersion = session.store.getState().version + 1;
  await db.insert(planIterations).values({
    conversationId: convId,
    version: newVersion,
    type: "revert",
    desiredState: session.store.snapshot() as unknown as Record<string, unknown>,
  });

  // Bump version for future turns
  session.store.getState().version = newVersion + 1;

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));

  return c.json({ reverted: true, version: newVersion });
});

// ── Edit state (manual desired-state replacement) ───────────────────────────

/**
 * Schema for the manually-edited desired state. Mirrors the structure produced
 * by `fork()` plus the per-resource fields the editor allows users to mutate.
 * Anything not in this schema is dropped — the client is the source of truth
 * for what the editor can change in v1.
 */
const editDesiredStateSchema = z.object({
  guildId: z.string(),
  guildName: z.string(),
  active: z.object({
    channels: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          type: z.number().int(),
          parentId: z.string().nullable(),
          position: z.number().int(),
          topic: z.string().nullable().optional(),
          nsfw: z.boolean().optional(),
          bitrate: z.number().int().optional(),
          userLimit: z.number().int().optional(),
          rateLimitPerUser: z.number().int().optional(),
          lockPermissions: z.boolean().optional(),
        })
        .passthrough()
    ),
    roles: z.record(
      z.string(),
      z
        .object({
          id: z.string(),
          name: z.string(),
          position: z.number().int(),
          permissions: z.array(z.string()),
          color: z.number().int(),
          hoist: z.boolean(),
          mentionable: z.boolean(),
        })
        .passthrough()
    ),
    overwrites: z.record(z.string(), z.unknown()),
    memberRoles: z
      .record(
        z.string(),
        z.object({
          memberId: z.string(),
          roleIds: z.array(z.string()),
        })
      )
      .optional(),
  }),
  tombstones: z.array(
    z.object({
      discordId: z.string(),
      resourceType: z.enum(["channel", "role", "category"]),
      name: z.string(),
      deletedInVersion: z.number().int(),
    })
  ),
  symbolCounter: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});

const editStateSchema = z.object({
  desiredState: editDesiredStateSchema,
});

conversationsApp.post("/:convId/edit-state", zValidator("json", editStateSchema), async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;
  const body = c.req.valid("json");

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const lockCheck = await checkGuildNotLocked(guildId);
  if (!lockCheck.ok) {
    return c.json({ error: lockCheck.error }, lockCheck.status);
  }

  // Look up the session. Manual edits are only valid after planning is done;
  // an active planning turn would clobber the edit on its next dispatch.
  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "Conversation is not active. Start a new planning session." }, 409);
  }

  if (session.status !== "completed") {
    return c.json(
      {
        error:
          "Cannot edit state while a planning turn is in progress. Wait for the current turn to finish or cancel the session.",
      },
      409
    );
  }

  // Replace the store with the client-provided state. This validates the
  // shape implicitly (zod) and reuses the canonical revert path.
  const newDesiredState = body.desiredState as unknown as DesiredState;
  session.store.revert(newDesiredState);

  // Bump to a fresh version for this manual edit and persist it.
  const newVersion = session.store.getState().version + 1;
  session.store.getState().version = newVersion;

  const [iteration] = await db
    .insert(planIterations)
    .values({
      conversationId: convId,
      version: newVersion,
      type: "manual_edit",
      desiredState: session.store.snapshot() as unknown as Record<string, unknown>,
    })
    .returning();

  // Reserve the next version number for any subsequent turn.
  session.store.getState().version = newVersion + 1;

  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));

  return c.json({
    iteration: {
      version: iteration.version,
      type: iteration.type,
      desiredState: iteration.desiredState,
      createdAt: iteration.createdAt,
    },
  });
});

// ── Template context management ─────────────────────────────────────────────

const templateContextSchema = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
});

conversationsApp.post(
  "/:convId/templates",
  zValidator("json", templateContextSchema),
  async (c) => {
    const guildId = c.req.param("guildId")!;
    const convId = c.req.param("convId")!;
    const body = c.req.valid("json");

    const access = await checkGuildAccess(c, guildId);
    if (!access.allowed) {
      return c.json({ error: access.error }, access.status as 404 | 403);
    }

    const staleCheck = await checkConversationNotStale(convId);
    if (!staleCheck.ok) {
      return c.json({ error: staleCheck.error }, staleCheck.status);
    }

    const session = getSession(convId);
    if (!session) {
      return c.json({ error: "No active planning session for this conversation" }, 409);
    }

    session.addTemplate({
      id: body.templateId,
      name: body.name,
      summary: body.summary,
    });

    return c.json({ added: true });
  }
);

conversationsApp.delete("/:convId/templates/:templateId", async (c) => {
  const guildId = c.req.param("guildId")!;
  const convId = c.req.param("convId")!;
  const templateId = c.req.param("templateId")!;

  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const staleCheck = await checkConversationNotStale(convId);
  if (!staleCheck.ok) {
    return c.json({ error: staleCheck.error }, staleCheck.status);
  }

  const session = getSession(convId);
  if (!session) {
    return c.json({ error: "No active planning session for this conversation" }, 409);
  }

  session.removeTemplate(templateId);

  return c.json({ removed: true });
});

export default conversationsApp;
