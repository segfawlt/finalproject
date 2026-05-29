import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, plans, snapshots, conversations, planIterations } from "@repo/db";
import { eq, desc, ne, and } from "drizzle-orm";
import { userHasManageGuild } from "../../auth/helpers";
import { checkGuildOperable } from "../../planning/guild-check";
import { acquireGuildLock, releaseGuildLock } from "../../planning/locking";
import { diffEngine } from "../../planning/diff-engine";
import { executePlan } from "../../planning/execution-engine";
import { validatePlan } from "../../planning/validation";
import { emitPlanEvent } from "../../planning/event-bus";
import { emitConversationEvent } from "../../planning/planning-event-bus";
import { getSessionsByGuild, removeSession } from "../../planning/session-manager";
import { DiscordExecuteContext } from "../../bot/execute-context";
import { botClient } from "../../bot/client";
import { guildCache } from "../../bot/cache";
import type { AppVariables } from "../../types";
import type { ServerState, PlanData, DesiredState } from "@repo/shared";
import { hashServerState, getTool, evaluateAssumptions, fork } from "@repo/shared";

const plansApp = new Hono<{ Variables: AppVariables }>();

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
  };
}

const listQuerySchema = z.object({
  conversationId: z.string().uuid().optional(),
});

plansApp.get("/", zValidator("query", listQuerySchema), async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const query = c.req.valid("query");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const planData: PlanData = {
    llmResponse: { summary: "", reasoning: "" },
  };

  const [plan] = await db
    .insert(plans)
    .values({
      guildId,
      userId: user?.id ?? "system",
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
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
            error: "Server state has changed since planning. Start a new conversation.",
          },
          409
        );
      }
    }
  }

  // 3. Build ServerState from cache
  const serverState = buildServerState(guildId);
  const guild = botClient.guilds.cache.get(guildId);

  // 4. Load desiredState from plan_iterations (preferred) or planData (fallback)
  const planData = plan.planData as unknown as PlanData;
  let desiredState: DesiredState;
  if (plan.conversationId) {
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
    desiredState = planData.desiredState as DesiredState;
  }
  const diffResult = diffEngine(serverState, desiredState);

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

  await db.update(plans).set({ status: "executing" }).where(eq(plans.id, planId));

  try {
    // 6. Create before snapshot
    await db.insert(snapshots).values({
      type: "execution_before",
      guildId,
      planId,
      data: serverState as unknown as Record<string, unknown>,
    });

    // 6. Execute
    const ctx = new DiscordExecuteContext(guild!);
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

    // 7. Create after snapshot
    const afterCache = guildCache.get(guildId);
    const afterState: ServerState = {
      guildId,
      guildName: guild?.name ?? guildId,
      memberCount: guild?.memberCount ?? 0,
      channels: afterCache ? Array.from(afterCache.channels.values()) : [],
      roles: afterCache ? Array.from(afterCache.roles.values()) : [],
      overwrites: afterCache ? Array.from(afterCache.permissions.values()) : [],
    };

    await db.insert(snapshots).values({
      type: "execution_after",
      guildId,
      planId,
      data: afterState as unknown as Record<string, unknown>,
    });

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

    // Mark sibling conversations as stale if forkStateHash no longer matches
    const currentHash = hashServerState(
      buildServerState(guildId) as unknown as Record<string, unknown>
    );
    await db
      .update(conversations)
      .set({ status: "stale" })
      .where(and(eq(conversations.guildId, guildId), ne(conversations.forkStateHash, currentHash)));

    // Invalidate in-memory sessions for stale conversations
    const activeSessions = getSessionsByGuild(guildId);
    for (const { conversationId, session } of activeSessions) {
      if (session.forkStateHash !== currentHash) {
        session.cancel("Server state has changed since planning began");
        removeSession(conversationId);
        await emitConversationEvent(conversationId, {
          type: "expired",
          error: "Server state has changed since planning. Start a new conversation.",
        });
      }
    }

    return c.json({
      success: executionResult.success,
      steps: executionResult.completedSteps,
      error: executionResult.error,
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

    return c.json({ error }, 500);
  } finally {
    executionAbortControllers.delete(planId);
    await releaseGuildLock(guildId);
  }
});

// ── Abort execution ─────────────────────────────────────────────────────────

plansApp.post("/:planId/abort", async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const planId = c.req.param("planId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
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
    .where(eq(snapshots.planId, planId))
    .orderBy(desc(snapshots.createdAt));

  if (!beforeSnapshot || beforeSnapshot.type !== "execution_before") {
    return c.json({ error: "Before-snapshot not found for rollback" }, 400);
  }

  const beforeState = beforeSnapshot.data as unknown as ServerState;
  const currentState = buildServerState(guildId);

  // 3. Diff current → before (reverse)
  const beforeDesiredState = fork(beforeState);
  const diffResult = diffEngine(currentState, beforeDesiredState);

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
    await releaseGuildLock(guildId);
  }
});

export default plansApp;
