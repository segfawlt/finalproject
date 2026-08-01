import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, plans, snapshots, conversations, planIterations } from "@repo/db";
import { eq, desc, ne, and } from "drizzle-orm";
import { userHasManageGuild } from "../../auth/helpers";
import { requireUser } from "../../auth/middleware";
import { checkGuildOperable } from "../../planning/guild-check";
import { loadGuildRuleTexts } from "../../planning/guild-rules";
import { acquireGuildLock, releaseGuildLock, heartbeatGuildLock } from "../../planning/locking";
import { diffEngine } from "../../planning/diff-engine";
import {
  executePlan,
  buildCurrentStateFromDiscord,
  rollbackFull,
} from "../../planning/execution-engine";
import { validatePlan } from "../../planning/validation";
import { emitPlanEvent } from "../../planning/event-bus";
import { emitConversationEvent } from "../../planning/planning-event-bus";
import { getSessionsByGuild, removeSession } from "../../planning/session-manager";
import { setSession } from "../../planning/session-manager";
import { PlanningSession, type LLMMessage } from "../../planning/planning-session";
import { buildRepairPrompt, type RepairConflict } from "../../planning/repair-context";
import { DiscordExecuteContext } from "../../bot/execute-context";
import { botClient } from "../../bot/client";
import { guildCache } from "../../bot/cache";
import { logger } from "../../utils/logger";
import type { AppVariables } from "../../types";
import type { ServerState, PlanData, DesiredState } from "@repo/shared";
import { hashServerState, getTool, evaluateAssumptions, fork } from "@repo/shared";

const plansApp = new Hono<{ Variables: AppVariables }>();

// Retention window for execution snapshots. cleanupExpiredSnapshots() runs
// daily and deletes rows past this point; without expires_at set, nothing
// is ever collected.
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const executionAbortControllers = new Map<string, AbortController>();

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

function buildConflictDetails(
  diffConflicts: RepairConflict[],
  assumptionMessages: string[]
): RepairConflict[] {
  return [
    ...diffConflicts,
    ...assumptionMessages.map((message) => ({ kind: "failed_assumption" as const, message })),
  ];
}

const listQuerySchema = z.object({
  conversationId: z.string().uuid().optional(),
});

plansApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const query = c.req.valid("query");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const conditions = eq(plans.guildId, guildId);

  let result;
  if (query.conversationId) {
    result = await db.select().from(plans).where(conditions).orderBy(desc(plans.createdAt));
    result = result.filter((p) => p.conversationId === query.conversationId);
  } else {
    result = await db.select().from(plans).where(conditions).orderBy(desc(plans.createdAt));
  }

  return c.json(result);
});

plansApp.get("/:planId", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));

  if (!plan || plan.guildId !== guildId) {
    return c.json({ error: "Plan not found" }, 404);
  }

  return c.json(plan);
});

// ── Create Plan ────────────────────────────────────────────────────────────

const createPlanSchema = z.object({
  conversationId: z.string().uuid().optional(),
  userPrompt: z.string().min(1),
  desiredState: z.record(z.unknown()),
  serverType: z.string().optional(),
});

plansApp.post("/", zValidator("json", createPlanSchema), async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const planData: PlanData = {
    llmResponse: { summary: "", reasoning: "" },
    desiredState: body.desiredState as unknown as DesiredState,
  };

  const [plan] = await db
    .insert(plans)
    .values({
      guildId,
      userId: user.id,
      conversationId: body.conversationId ?? null,
      status: "draft",
      userPrompt: body.userPrompt,
      serverType: body.serverType ?? null,
      planData: planData as unknown as Record<string, unknown>,
    })
    .returning();

  // Store desiredState in plan_iterations for unified access
  if (body.conversationId) {
    await db.insert(planIterations).values({
      conversationId: body.conversationId,
      version: 1,
      type: "manual_edit",
      desiredState: body.desiredState as unknown as Record<string, unknown>,
    });
  }

  return c.json(plan, 201);
});

// ── Execute Plan ───────────────────────────────────────────────────────────

plansApp.post("/:planId/execute", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 1. Load plan
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan || plan.guildId !== guildId) {
    return c.json({ error: "Plan not found" }, 404);
  }

  if (plan.status !== "draft" && plan.status !== "approved") {
    return c.json({ error: "Plan is not in a valid state for execution" }, 400);
  }

  // 2. Stale detection — compare conversation forkStateHash against current state
  if (plan.conversationId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, plan.conversationId));
    if (conv) {
      const freshState = buildServerState(guildId);
      const currentHash = hashServerState(freshState as unknown as Record<string, unknown>);
      if (conv.forkStateHash !== currentHash) {
        return c.json(
          {
            error: "Server state has changed since planning. Re-plan with AI to adapt the plan.",
            conflicts: ["Server state changed externally since planning began."],
            canAIRepair: true,
          },
          409
        );
      }
    }
  }

  // 3. Build ServerState from cache
  const serverState = buildServerState(guildId);
  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) {
    return c.json({ error: "Guild not found in bot cache" }, 503);
  }

  // 4. Load desiredState — prefer snapshot in planData (approved contract), fallback to latest iteration
  const planData = plan.planData as unknown as PlanData;
  let desiredState: DesiredState;
  if (planData.desiredState) {
    desiredState = planData.desiredState;
  } else if (plan.conversationId) {
    const [latestIteration] = await db
      .select()
      .from(planIterations)
      .where(eq(planIterations.conversationId, plan.conversationId))
      .orderBy(desc(planIterations.version))
      .limit(1);
    if (!latestIteration) {
      return c.json({ error: "No plan iterations found for this conversation" }, 400);
    }
    desiredState = latestIteration.desiredState as unknown as DesiredState;
  } else {
    return c.json({ error: "Plan has no desiredState and no conversation to resolve from" }, 400);
  }
  const diffResult = diffEngine(serverState, desiredState);

  if (diffResult.conflicts.length > 0) {
    return c.json(
      {
        error: "Plan references resources that no longer exist. Re-plan with AI to adapt it.",
        conflicts: diffResult.conflicts.map((conflict) => conflict.message),
        canAIRepair: Boolean(plan.conversationId),
      },
      409
    );
  }

  // 5. Pre-execution assumption checks
  const allAssumptions = diffResult.steps
    .map((step) => {
      const tool = getTool(step.toolName);
      if (!tool.getAssumptions) return [];
      return tool.getAssumptions(step.params);
    })
    .flat();

  const assumptionResults = evaluateAssumptions(allAssumptions, serverState);
  const failedAssumptions = assumptionResults.filter((r) => !r.passed);

  if (failedAssumptions.length > 0) {
    logger.warn(
      {
        planId,
        guildId,
        stepCount: diffResult.steps.length,
        failedCount: failedAssumptions.length,
        conflicts: failedAssumptions.map((r) => r.message),
      },
      "[plans] pre-execution assumptions failed"
    );
    return c.json(
      {
        error: "Pre-execution assumptions failed",
        conflicts: failedAssumptions.map((r) => r.message),
      },
      409
    );
  }

  // 6. Stage 1 validation (hard-coded checks)
  const validationResult = await validatePlan({
    steps: diffResult.steps,
    symbolTable: diffResult.symbolTable,
    desiredState,
    guildId,
    status: plan.status as "draft" | "validated" | "approved",
  });

  if (!validationResult.passed) {
    const blockers = validationResult.issues.filter((i) => i.severity === "block");
    const warnings = validationResult.issues.filter((i) => i.severity === "warning");
    logger.warn(
      {
        planId,
        guildId,
        stepCount: diffResult.steps.length,
        blockerCount: blockers.length,
        warningCount: warnings.length,
        blockers,
        warnings,
      },
      "[plans] plan validation failed"
    );
    return c.json(
      {
        error: "Plan validation failed",
        blockers,
        warnings,
      },
      400
    );
  }

  await db.update(plans).set({ status: "validated" }).where(eq(plans.id, planId));

  // 5. Acquire guild lock
  const locked = await acquireGuildLock(guildId, planId);
  if (!locked) {
    return c.json({ error: "Another plan is currently executing for this guild" }, 423);
  }

  const abortController = new AbortController();
  const EXECUTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const timeoutSignal = AbortSignal.timeout(EXECUTION_TIMEOUT_MS);
  timeoutSignal.addEventListener("abort", () => {
    abortController.abort("Execution timed out after 5 minutes");
  });
  executionAbortControllers.set(planId, abortController);

  // Heartbeat the lock so long executions don't get cleared by the stale-lock job
  const ownerId = process.pid.toString();
  const heartbeat = setInterval(() => {
    heartbeatGuildLock(guildId, ownerId).catch((err) => {
      logger.error(err, "[plans] heartbeat failed");
    });
  }, 60_000);

  await db.update(plans).set({ status: "executing" }).where(eq(plans.id, planId));

  let beforeSnapshot: ServerState | null = null;

  try {
    // 6. Create before snapshot
    beforeSnapshot = serverState;
    await db.insert(snapshots).values({
      type: "execution_before",
      guildId,
      planId,
      data: serverState as unknown as Record<string, unknown>,
      expiresAt: new Date(Date.now() + SNAPSHOT_RETENTION_MS),
    });

    // 6. Execute
    const ctx = new DiscordExecuteContext(guild);
    const executionResult = await executePlan({
      planId,
      steps: diffResult.steps,
      symbolTable: diffResult.symbolTable,
      ctx,
      emit: async (event) => {
        emitPlanEvent(planId, event);
      },
      abortSignal: abortController.signal,
      beforeSnapshot: serverState,
    });

    // 7. Create after snapshot — fetch fresh from Discord so the
    //    execution_after row reflects what actually happened, not whatever
    //    the in-memory cache had not yet absorbed from async events.
    let afterState: ServerState | null = null;
    try {
      afterState = await buildCurrentStateFromDiscord(guildId);
    } catch (err) {
      logger.error(err, "[plans] failed to build after-snapshot from Discord");
    }

    if (afterState) {
      await db.insert(snapshots).values({
        type: "execution_after",
        guildId,
        planId,
        data: afterState as unknown as Record<string, unknown>,
        expiresAt: new Date(Date.now() + SNAPSHOT_RETENTION_MS),
      });
    }

    // 8. Update plan status
    const finalStatus = executionResult.success ? "completed" : "failed";
    await db
      .update(plans)
      .set({
        status: finalStatus,
        planData: {
          ...planData,
          executionSteps: executionResult.completedSteps,
          symbolTable: diffResult.symbolTable,
        } as unknown as Record<string, unknown>,
        executedAt: new Date(),
        completedAt: executionResult.success ? new Date() : null,
        error: executionResult.error ? { message: executionResult.error } : null,
      })
      .where(eq(plans.id, planId));

    const activeSessions = getSessionsByGuild(guildId);
    if (afterState) {
      // Mark sibling conversations as stale if forkStateHash no longer matches.
      const currentHash = hashServerState(afterState as unknown as Record<string, unknown>);
      await db
        .update(conversations)
        .set({ status: "stale" })
        .where(
          and(eq(conversations.guildId, guildId), ne(conversations.forkStateHash, currentHash))
        );

      for (const { conversationId, session } of activeSessions) {
        if (session.forkStateHash === currentHash) continue;
        session.cancel("Server state has changed since planning began");
        removeSession(conversationId);
        await emitConversationEvent(conversationId, {
          type: "expired",
          error: "Server state has changed since planning. Start a new conversation.",
        });
      }
    } else {
      // Execution may have changed Discord, but without a verified fresh read
      // there is no safe hash to compare. Conservatively invalidate every
      // conversation for the guild instead of inventing an empty snapshot.
      await db
        .update(conversations)
        .set({ status: "stale" })
        .where(eq(conversations.guildId, guildId));

      for (const { conversationId, session } of activeSessions) {
        session.cancel("Discord state could not be verified after execution");
        removeSession(conversationId);
        await emitConversationEvent(conversationId, {
          type: "expired",
          error: "Discord state could not be verified after execution. Start a new conversation.",
        });
      }
    }

    return c.json({
      success: executionResult.success,
      steps: executionResult.completedSteps,
      error: executionResult.error,
      afterSnapshotAvailable: afterState !== null,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db
      .update(plans)
      .set({
        status: "failed",
        error: { message: error },
      })
      .where(eq(plans.id, planId));

    // Roll back if we got far enough to capture a before-snapshot but failed
    // somewhere after execution started (or in the post-execute bookkeeping).
    if (beforeSnapshot) {
      // If the bot disconnected mid-execution, the cache won't have the
      // guild; rollback would throw on buildCurrentStateFromDiscord. Skip
      // it and report 503 so the user knows the Discord state may be
      // partially mutated and needs manual review.
      if (!botClient.guilds.cache.get(guildId)) {
        logger.error(
          { planId, guildId },
          "[plans] bot disconnected during execution; skipping rollback"
        );
      } else {
        try {
          const ctx = new DiscordExecuteContext(guild);
          await emitPlanEvent(planId, { type: "rollback_started", planId });
          await rollbackFull(beforeSnapshot, planId, ctx, async (event) => {
            emitPlanEvent(planId, event);
          });
        } catch (rollbackErr) {
          logger.error(rollbackErr, "[plans] rollback after failure also failed");
        }
      }
    }

    return c.json({ error }, 500);
  } finally {
    clearInterval(heartbeat);
    executionAbortControllers.delete(planId);
    await releaseGuildLock(guildId, ownerId);
  }
});

// ── Re-plan stale plan with fresh Discord state ────────────────────────────

plansApp.post("/:planId/replan", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) return c.json({ error: operable.error }, operable.status);

  if (!(await userHasManageGuild(user.id, guildId))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan || plan.guildId !== guildId) return c.json({ error: "Plan not found" }, 404);
  if (!plan.conversationId) {
    return c.json({ error: "This plan has no conversation context for AI repair" }, 409);
  }
  if (plan.status !== "draft" && plan.status !== "approved") {
    return c.json({ error: "Only unexecuted plans can be re-planned" }, 400);
  }

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, plan.conversationId));
  if (!conversation || conversation.guildId !== guildId) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const planData = plan.planData as unknown as PlanData;
  if (!planData.desiredState) {
    return c.json({ error: "Plan has no desired state to repair" }, 400);
  }

  const currentState = buildServerState(guildId);
  const diffResult = diffEngine(currentState, planData.desiredState);
  const assumptions = diffResult.steps.flatMap((step) => {
    const tool = getTool(step.toolName);
    return tool.getAssumptions ? tool.getAssumptions(step.params) : [];
  });
  const failedAssumptions = evaluateAssumptions(assumptions, currentState)
    .filter((result) => !result.passed)
    .map((result) => result.message);
  const conflicts = buildConflictDetails(diffResult.conflicts, failedAssumptions);
  const currentHash = hashServerState(currentState as unknown as Record<string, unknown>);

  if (conflicts.length === 0 && conversation.forkStateHash !== currentHash) {
    conflicts.push({
      kind: "server_state_changed",
      message: "Server state changed externally since planning began.",
    });
  }

  const [latestIteration] = await db
    .select()
    .from(planIterations)
    .where(eq(planIterations.conversationId, conversation.id))
    .orderBy(desc(planIterations.version))
    .limit(1);
  const repairPrompt = buildRepairPrompt({
    currentState,
    previousDesiredState: planData.desiredState,
    conflicts,
  });
  const guildRules = await loadGuildRuleTexts(guildId);

  const session = new PlanningSession({
    guildId,
    conversationId: conversation.id,
    userPrompt: conversation.userPrompt,
    serverState: currentState,
    forkStateHash: currentHash,
    messages: conversation.messages as unknown as LLMMessage[],
    repairPrompt,
    guildRules,
    emit: async (event) => {
      emitConversationEvent(conversation.id, event);
      if (event.type === "ask_user") {
        await db
          .update(conversations)
          .set({ status: "waiting_for_user", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }
      if (event.type === "completed") {
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
    onTurnComplete: async (repairSession) => {
      const version = repairSession.store.getState().version;
      await db.insert(planIterations).values({
        conversationId: conversation.id,
        version,
        type: "llm_generated",
        desiredState: repairSession.store.snapshot() as unknown as Record<string, unknown>,
      });
      repairSession.store.getState().version += 1;
      await db
        .update(conversations)
        .set({
          messages: repairSession.getMessages() as unknown as Record<string, unknown>[],
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
    },
  });

  session.store.getState().version = (latestIteration?.version ?? -1) + 1;
  await db
    .update(conversations)
    .set({ status: "planning", forkStateHash: currentHash, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));
  setSession(conversation.id, session);
  session.start().catch((err) => {
    logger.error(err, "[plans] AI re-plan failed");
    removeSession(conversation.id);
  });

  return c.json({ replanStarted: true, conversationId: conversation.id, conflicts }, 202);
});

// ── Abort execution ─────────────────────────────────────────────────────────

plansApp.post("/:planId/abort", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const ac = executionAbortControllers.get(planId);
  if (!ac) {
    return c.json({ error: "No active execution for this plan" }, 404);
  }

  ac.abort("User requested abort");
  return c.json({ aborted: true });
});

// ── Rollback ─────────────────────────────────────────────────────────────────

plansApp.post("/:planId/rollback", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // 1. Load plan
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!plan || plan.guildId !== guildId) {
    return c.json({ error: "Plan not found" }, 404);
  }

  if (plan.status !== "completed") {
    return c.json({ error: "Plan must be completed to rollback" }, 400);
  }

  // 2. Load before-snapshot
  const [beforeSnapshot] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.planId, planId), eq(snapshots.type, "execution_before")))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);

  if (!beforeSnapshot) {
    return c.json({ error: "Before-snapshot not found for rollback" }, 400);
  }

  const beforeState = beforeSnapshot.data as unknown as ServerState;
  const currentState = await buildCurrentStateFromDiscord(guildId);

  // 3. Diff current → before (reverse)
  const beforeDesiredState = fork(beforeState);
  const diffResult = diffEngine(currentState, beforeDesiredState);

  if (diffResult.conflicts.length > 0) {
    return c.json(
      {
        error: "Rollback is blocked because resources from the before-state no longer exist.",
        conflicts: diffResult.conflicts.map((conflict) => conflict.message),
      },
      409
    );
  }

  if (diffResult.steps.length === 0) {
    await db.update(plans).set({ status: "rolled_back" }).where(eq(plans.id, planId));
    return c.json({ rolledBack: true, steps: 0 });
  }

  // 4. Acquire guild lock
  const locked = await acquireGuildLock(guildId, planId);
  if (!locked) {
    return c.json({ error: "Another plan is currently executing for this guild" }, 423);
  }

  try {
    const guild = botClient.guilds.cache.get(guildId);
    if (!guild) {
      return c.json({ error: "Guild not found" }, 404);
    }

    const ctx = new DiscordExecuteContext(guild);
    const executionResult = await executePlan({
      planId,
      steps: diffResult.steps,
      symbolTable: diffResult.symbolTable,
      ctx,
      emit: async (event) => {
        emitPlanEvent(planId, event);
      },
    });

    const finalStatus = executionResult.success ? "rolled_back" : "failed";
    await db.update(plans).set({ status: finalStatus }).where(eq(plans.id, planId));

    return c.json({
      rolledBack: executionResult.success,
      steps: executionResult.completedSteps.length,
      error: executionResult.error,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.update(plans).set({ status: "failed" }).where(eq(plans.id, planId));
    return c.json({ error }, 500);
  } finally {
    await releaseGuildLock(guildId, process.pid.toString());
  }
});

export default plansApp;
