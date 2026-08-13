# Codebase Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a compact, source-verified, AI-oriented map of the current project's main backend feature flows.

**Architecture:** Add one Markdown index, `docs/CODEBASE_MAP.md`, ordered by backend responsibility and limited to feature entry points, core symbols, and flow edges. Treat the complete current working tree as evidence; do not copy claims from `IMPLEMENTATION_STATUS.md` unless confirmed in source.

**Tech Stack:** Markdown; TypeScript; Hono; Discord.js; Drizzle; React only for feature entry references.

---

## File Structure

- Create: `docs/CODEBASE_MAP.md` — concise AI query index for the project's current implementation.
- Create: `docs/superpowers/specs/2026-08-13-codebase-map-design.md` — approved design record (already written during brainstorming).
- Create: `docs/superpowers/plans/2026-08-13-codebase-map.md` — this implementation plan.

### Task 1: Build the backend flow index

**Files:**

- Create: `docs/CODEBASE_MAP.md`

- [ ] **Step 1: Inspect current entry points and orchestration symbols**

Read these source files, including the uncommitted implementations:

```text
apps/server/src/index.ts
apps/server/src/hono/app.ts
apps/server/src/hono/routes/conversations.ts
apps/server/src/hono/routes/plans.ts
apps/server/src/planning/planning-session.ts
apps/server/src/planning/execution-engine.ts
apps/server/src/planning/validation.ts
apps/server/src/planning/diff-engine.ts
```

Record only confirmed route handlers, classes/functions, emitted events, and direct flow edges.

- [ ] **Step 2: Create the document header and project flow section**

Create `docs/CODEBASE_MAP.md` with this compact convention and initial flow:

```md
# Codebase Map

Current working tree; source-derived. Format: `symbol` (`path`).

## Main flow

Purpose: Natural-language Discord configuration -> reviewed, executable declarative plan.
In: `Studio` (`apps/web/src/routes/Studio.tsx`) -> `useConversation` (`apps/web/src/hooks/useConversation.ts`) -> conversations routes (`apps/server/src/hono/routes/conversations.ts`).
Flow: conversation -> `PlanningSession` (`apps/server/src/planning/planning-session.ts`) -> `DesiredStateStore` (`packages/shared/src/state/desired-state-store.ts`) -> iteration DB -> planning SSE -> approve -> validate -> diff -> execute -> Discord/cache.
```

- [ ] **Step 3: Add planning and conversational-control sections**

Document these source-backed symbols and relationships in compact sections:

```text
PlanningSession; prepareMessagesForModel; buildLLMRequest; parseOpenRouterStream;
TOOL_REGISTRY; getOpenAIFunctionDefinitions; DesiredStateStore; fork;
planning-event-bus; session-manager; loadGuildRuleTexts; SHARED_CORE_PROMPT;
SERVER_PLANNER_PROMPT; buildRepairPrompt.
```

Include the create/revise/ask-user/cancel/revert/edit-state and stale-replan route flows from `conversations.ts` and `plans.ts`. State that planning persists iterations before terminal planning SSE only if confirmed by `PlanningSession` source.

- [ ] **Step 4: Add validation, approval, execution, and rollback sections**

Document the confirmed execution flow:

```text
validatePlan -> evaluateAssumptions -> diffEngine -> acquireGuildLock -> executePlan
-> DiscordExecuteContext/tool execute functions -> emitPlanEvent -> releaseGuildLock.
```

Reference `rollbackFull`, `buildCurrentStateFromDiscord`, `event-bus`, `locking`, `guild-check`,
`DiscordExecuteContext`, and `ExecuteContext`. Include abort and stale-plan replan routes only as
entry points; do not explain retry internals or copy validation-rule inventories.

- [ ] **Step 5: Add Discord state and drift sections**

Use these confirmed source symbols:

```text
setupBotEvents; guildCache; initGuildCache; formatGuildForLLM; botHasAdministrator;
detectDrift; emitDriftEvent; subscribeToGuildDrift; startDriftDetector;
hashServerState; state routes.
```

Describe the short flow from Discord gateway or periodic comparison to cache/drift persistence/SSE
as confirmed by source. Do not document every Discord event or cache lookup helper.

- [ ] **Step 6: Add templates and model configuration sections**

Inspect and index the current uncommitted template/model work:

```text
apps/server/src/hono/routes/templates.ts
apps/server/src/templates/template-version-service.ts
apps/server/src/templates/template-state.ts
apps/server/src/planning/template-session.ts
apps/server/src/planning/template-session-manager.ts
apps/server/src/planning/template-event-bus.ts
apps/server/src/planning/model-config.ts
apps/server/src/planning/deployment-model-config.ts
apps/server/src/planning/openrouter-models.ts
apps/server/src/hono/routes/settings.ts
```

Add sections naming `TemplateSession`, `commitTemplateStructure`, `revertTemplateVersion`,
`toTemplateDesiredState`, template SSE, `resolveConfiguredModels`, `validateModelSelection`,
`resolveDeploymentModelConfig`, and `getOpenRouterModels`. Link each to only its relevant frontend
entry (`TemplateStudio`, `useTemplateAuthoring`, or `ModelSelector`) when source confirms the path.

- [ ] **Step 7: Add auth, API/SSE, and persistence contract sections**

Inspect and document only the symbols necessary to trace backend ownership and persistence:

```text
apps/server/src/auth/middleware.ts
apps/server/src/auth/helpers.ts
apps/server/src/hono/app.ts
apps/server/src/hono/routes/guilds.ts
apps/server/src/hono/routes/state.ts
apps/server/src/hono/routes/rules.ts
apps/server/src/planning/event-bus.ts
apps/server/src/planning/planning-event-bus.ts
apps/server/src/planning/template-event-bus.ts
packages/db/src/schema.ts
packages/shared/src/types.ts
packages/shared/src/execute-context.ts
```

Name `authMiddleware`, `requireAuth`, `userHasManageGuild`, each SSE subscription function, and
the relevant table/type groups. Do not enumerate every column, schema field, or API endpoint.

- [ ] **Step 8: Check the document against the working tree**

For each backticked path and symbol in `docs/CODEBASE_MAP.md`, confirm it exists and that the stated
flow is directly supported by imports/calls in the source. Remove unsupported claims, duplicate
details, low-level helpers, and UI-only implementation notes.

- [ ] **Step 9: Format and verify the Markdown document**

Run:

```bash
pnpm exec prettier --check docs/CODEBASE_MAP.md docs/superpowers/specs/2026-08-13-codebase-map-design.md docs/superpowers/plans/2026-08-13-codebase-map.md
```

Expected: Prettier reports all three Markdown files are formatted.

- [ ] **Step 10: Commit documentation**

Run:

```bash
git add docs/CODEBASE_MAP.md docs/superpowers/specs/2026-08-13-codebase-map-design.md docs/superpowers/plans/2026-08-13-codebase-map.md
```

Expected: a commit containing only the three documentation files, unless they are intentionally
included with the user's existing documentation work.

## Plan Self-Review

- Spec coverage: Task 1 covers the current working tree, backend-first order, function/path
  references, frontend entry references, compact fields, and source verification.
- Placeholder scan: no placeholders or deferred implementation statements remain.
- Type consistency: all named symbols are existing source exports/classes or route app handlers;
  the final document will name only symbols confirmed during the task.
