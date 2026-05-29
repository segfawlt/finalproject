# Design Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix stale session invalidation, unify rollback/abort, remove PlanData redundancy, close contradictory design issue #10, and standardize phase numbering.

**Architecture:** Add session invalidation hooks after execution, replace partial rollback with diff-based full rollback using AbortController, make plan_iterations the sole source of truth for desired state.

**Tech Stack:** TypeScript, Hono, Discord.js v14, Drizzle ORM, PostgreSQL

---

## Files Overview

| File                                           | Responsibility                      | Change                                                                                              |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/server/src/planning/session-manager.ts`  | In-memory session tracking          | Add `getSessionsByGuild`, `removeSession` enhancements                                              |
| `apps/server/src/planning/planning-session.ts` | LLM planning loop                   | Add `cancel(reason)` parameter                                                                      |
| `apps/server/src/planning/execution-engine.ts` | Discord execution + rollback        | Replace `rollbackSteps` with unified `rollbackFull`, add abort signal                               |
| `apps/server/src/hono/routes/plans.ts`         | Plan execution + rollback endpoints | Add AbortController storage, abort endpoint, invalidate sessions, read desiredState from iterations |
| `apps/server/src/hono/routes/conversations.ts` | Conversation lifecycle              | Add stale/lock checks to ask-user, revise, approve, revert; remove desiredState from plan creation  |
| `packages/shared/src/types.ts`                 | Domain types                        | Remove `desiredState` from `PlanData` type                                                          |
| `docs/issues/open-design-issues.md`            | Design decisions log                | Close #10 with rationale                                                                            |
| `docs/design/desired-state-and-diff-engine.md` | Design docs                         | Standardize phase references                                                                        |

---

## Task 1: Session Invalidation + Stale Checks

**Files:**

- Modify: `apps/server/src/planning/session-manager.ts`
- Modify: `apps/server/src/planning/planning-session.ts`
- Modify: `apps/server/src/hono/routes/plans.ts`
- Modify: `apps/server/src/hono/routes/conversations.ts`

### Step 1.1: Add session lookup by guild

Modify `session-manager.ts`:

```ts
export function getSessionsByGuild(
  guildId: string
): { conversationId: string; session: PlanningSession }[] {
  const result: { conversationId: string; session: PlanningSession }[] = [];
  for (const [conversationId, entry] of sessions) {
    if (entry.session.guildId === guildId) {
      result.push({ conversationId, session: entry.session });
    }
  }
  return result;
}
```

### Step 1.2: Add reason parameter to cancel

Modify `planning-session.ts:178-185`:

```ts
/** Cancel the current planning loop. Reverts to last snapshot if called mid-turn. */
cancel(reason = "User cancelled"): void {
  this.status = "idle";
  this.abortController.abort(reason);
  if (this.preTurnSnapshot) {
    this.store.revert(this.preTurnSnapshot);
  }
}
```

### Step 1.3: Invalidate in-memory sessions after execution

Modify `plans.ts:310-321` (after execution, before releasing lock):

```ts
// 10. Invalidate in-memory sessions for stale conversations
const activeSessions = (await import("../../planning/session-manager")).getSessionsByGuild(guildId);
for (const { conversationId, session } of activeSessions) {
  if (session.forkStateHash !== currentHash) {
    session.cancel("Server state has changed since planning began");
    (await import("../../planning/session-manager")).removeSession(conversationId);
    await db
      .update(conversations)
      .set({ status: "stale", updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await emitConversationEvent(conversationId, {
      type: "expired",
      error: "Server state has changed since planning. Start a new conversation.",
    });
  }
}
```

### Step 1.4: Add stale + lock checks to conversation routes

Modify `conversations.ts:253-285` (ask-user route), add BEFORE line 263:

```ts
// Check conversation is not stale
const [conversation] = await db.select().from(conversations).where(eq(conversations.id, convId));
if (!conversation || conversation.status === "stale") {
  return c.json({ error: "Conversation is stale. Server state has changed." }, 409);
}

// Check no plan is executing for this guild
const { isGuildLocked } = await import("../../planning/locking");
if (await isGuildLocked(guildId)) {
  return c.json({ error: "A plan is currently executing for this guild. Try again later." }, 423);
}
```

Same check added to revise route (`conversations.ts:372-402`) and approve route (`conversations.ts:317-363`) and revert route (`conversations.ts:406-450`).

---

## Task 2: Unified Rollback + Abort Signal

**Files:**

- Modify: `apps/server/src/planning/execution-engine.ts`
- Modify: `apps/server/src/hono/routes/plans.ts`

### Step 2.1: Replace partial rollback with unified function

Modify `execution-engine.ts:200-248`:

Replace `rollbackSteps` with:

```ts
async function rollbackFull(
  beforeSnapshot: ServerState,
  guildId: string,
  planId: string,
  ctx: ExecuteContext,
  emit: EventEmitter
): Promise<ExecutionResult> {
  await emit({ type: "rollback_started", planId });

  const { fork, diffEngine, executePlan, buildServerState } = await import("@repo/shared");
  const currentState = buildServerState(guildId);
  const desiredBefore = fork(beforeSnapshot);
  const diffResult = diffEngine(currentState, desiredBefore);

  if (diffResult.steps.length === 0) {
    await emit({ type: "rollback_completed", planId });
    return { success: true, completedSteps: [] };
  }

  const result = await executePlan({
    planId,
    steps: diffResult.steps,
    symbolTable: diffResult.symbolTable,
    ctx,
    emit,
  });

  await emit({ type: "rollback_completed", planId });
  return result;
}
```

Delete the old `rollbackSteps` and `getInverseTool` functions.

### Step 2.2: Add abort signal to executePlan

Modify `execution-engine.ts:40-46`:

```ts
export interface ExecutionOptions {
  planId: string;
  steps: PlanStep[];
  symbolTable: SymbolTable;
  ctx: ExecuteContext;
  emit: EventEmitter;
  abortSignal?: AbortSignal;
  beforeSnapshot?: ServerState;
}
```

Modify execution loop (`execution-engine.ts:280-382`):

Inside the for-loop, before resolving symbols:

```ts
// Check abort signal
if (options.abortSignal?.aborted) {
  if (options.beforeSnapshot) {
    const rollbackResult = await rollbackFull(
      options.beforeSnapshot,
      ctx.guildId,
      planId,
      ctx,
      emit
    );
    if (!rollbackResult.success) {
      await emit({ type: "plan_failed", planId, error: "Rollback after abort failed" });
      return { success: false, completedSteps, error: "Rollback after abort failed" };
    }
  }
  await emit({ type: "plan_failed", planId, error: "Execution aborted by user" });
  return { success: false, completedSteps, error: "Execution aborted by user" };
}
```

On failure, replace the old `rollbackSteps` call:

```ts
// Old: await rollbackSteps(completedSteps, ctx, emit);
// New:
if (options.beforeSnapshot) {
  await rollbackFull(options.beforeSnapshot, ctx.guildId, planId, ctx, emit);
}
```

### Step 2.3: Add AbortController storage + abort endpoint

Modify `plans.ts` — add near top of file:

```ts
const executionAbortControllers = new Map<string, AbortController>();
```

In the execute route, after acquiring lock (`plans.ts:246-250`):

```ts
const abortController = new AbortController();
executionAbortControllers.set(planId, abortController);
```

In the finally block (`plans.ts:339-341`):

```ts
executionAbortControllers.delete(planId);
await releaseGuildLock(guildId);
```

Pass to executePlan (`plans.ts:264-273`):

```ts
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
```

Add new abort endpoint after the execute route:

```ts
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
```

### Step 2.4: Update rollback endpoint to use shared function

The rollback endpoint (`plans.ts:346-434`) already does diff-based rollback correctly. Extract the shared logic into a helper function `performRollback` and reuse it from both the rollback endpoint and `rollbackFull`.

---

## Task 3: Remove desiredState from PlanData

**Files:**

- Modify: `packages/shared/src/types.ts`
- Modify: `apps/server/src/hono/routes/conversations.ts`
- Modify: `apps/server/src/hono/routes/plans.ts`

### Step 3.1: Remove desiredState from PlanData type

Modify `packages/shared/src/types.ts`:

```ts
export interface PlanData {
  llmResponse?: { summary: string; reasoning: string };
  // desiredState removed — read from plan_iterations instead
  executionSteps?: PlanStep[];
  symbolTable?: SymbolTable;
  assumptions?: Assumption[];
  snapshots?: { before?: string; after?: string };
  results?: { created: string[]; modified: string[]; deleted: string[] };
}
```

### Step 3.2: Update approve route

Modify `conversations.ts:317-364`:

Remove desiredState from planData:

```ts
const planData = {
  llmResponse: {
    summary: session.lastSummary,
    reasoning: session.lastReasoning,
  },
};
```

### Step 3.3: Update execute route to read from iterations

Modify `plans.ts:196-198`:

```ts
// Load latest iteration's desiredState instead of planData.desiredState
const [latestIteration] = await db
  .select()
  .from(planIterations)
  .where(eq(planIterations.conversationId, plan.conversationId))
  .orderBy(desc(planIterations.version))
  .limit(1);

if (!latestIteration) {
  return c.json({ error: "No plan iterations found for this conversation" }, 400);
}

const desiredState = latestIteration.desiredState as unknown as DesiredState;
```

### Step 3.4: Update plan creation route

Modify `plans.ts:121-124`:

```ts
const planData: PlanData = {
  llmResponse: { summary: "", reasoning: "" },
};
```

---

## Task 4: Close Issue #10

**Files:**

- Modify: `docs/issues/open-design-issues.md`

### Step 4.1: Update issue #10

Replace the open status and add rationale:

```markdown
## 10. Plan Optimizer Heuristics

**Status:** CLOSED — Won't fix. Contradicts 4-layer prevention stack.

**Resolution:** The 4-layer prevention stack (desired-state-and-diff-engine.md) explicitly rejects algorithmic rename detection:

- Layer 1: Right tools exist (edit_channel)
- Layer 2: LLM prompt guides correct usage
- Layer 3: Approval UI presents facts, human judges
- Layer 4: Diff engine is dumb and deterministic

An auto-converting optimizer would silently override the human's approval, undermining trust and introducing heuristic tuning burden. If the LLM repeatedly does delete+create despite prompts, the fix is the prompt (Layer 2) or tool guidance (Layer 1), not a heuristic layer.
```

---

## Task 5: Standardize Phase Numbering

**Files:**

- Modify: `docs/design/desired-state-and-diff-engine.md`

### Step 5.1: Update terminology

Replace "3 technical stages" references with "3-stage pipeline" and add clear phase mapping:

```markdown
## Phase Mapping

This document describes the **3-stage pipeline** (technical implementation). These map to the 6-phase user flow in [overview.md](./overview.md#the-6-phase-flow):

| 3-Stage Pipeline | 6-Phase User Flow                        |
| ---------------- | ---------------------------------------- |
| Planning Phase   | Phase 2 (Planning) + Phase 3 (Iteration) |
| Approval Phase   | Phase 4 (Approval)                       |
| Execution Phase  | Phase 5 (Execution)                      |
```

Update all internal "Phase 1/2/3" references in the document to use "3-stage pipeline" language.

---

## Verification

After all tasks:

1. **Lint check**: `pnpm lint`
2. **Format check**: `pnpm format:check`
3. **Type check**: `pnpm tsc --noEmit` (if available)
4. **Manual verification** of key flows:
   - Create conversation → plan → execute → verify stale marking works
   - Abort mid-execution → verify rollback restores state
   - Approve conversation → verify plan is created without desiredState in planData

---

## Self-Review Checklist

- [ ] All 5 tasks map to the 7 design revisions discussed
- [ ] No placeholders or TBD items
- [ ] Type consistency: `PlanData`, `ExecutionOptions`, `cancel(reason)` signatures match across files
- [ ] planData.desiredState is removed from ALL reads and writes
- [ ] rollbackFull is used for both failure and abort paths
- [ ] Session invalidation covers all guild sessions, not just the executing one
- [ ] Stale checks added to all conversation mutation routes
