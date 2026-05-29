# Open Design Issues

Outstanding design decisions that need resolution before or during implementation.
Ranked by downstream dependency — issues earlier in the list block more things.

Last updated: 2026-05-28. Most issues are now RESOLVED (implemented or decided).
Open work: Configuration procedure (#24), lockPermissions (#23), template system (#18).
Member role management (#22) is now IMPLEMENTED.

---

## 1. LLM SDK Choice

**Status:** RESOLVED — raw fetch chosen

**Decision:** Use raw `fetch()` to call OpenRouter's OpenAI-compatible API directly.
No SDK wrapper. Rationale:

- The tool architecture (ImmediateTool vs DeferredTool, `plan()` vs `execute()`) is
  custom — no SDK's tool execution model aligns with it. Every SDK expects tools to
  execute immediately and return results to the LLM. Our tools record intent during
  planning via `plan()` and execute later via `execute()`.
- The integration surface is small: one HTTP POST, one SSE stream parse, tool call
  delta accumulation. Raw fetch adds ~80 lines of code vs an SDK.
- No SDK reduces dependency weight, avoids abstraction mismatch, and gives full
  control over the planning loop.
- The OpenAI SDK was considered but rejected — it would save ~30 lines of SSE parsing
  at the cost of a 2MB dependency whose primary value (typed tool execution) is
  irrelevant to this architecture.
- The Vercel AI SDK was rejected because it assumes tools execute immediately within
  a `tool()` wrapper, conflicting with the DeferredTool pattern.

The LLM API call pattern:

```
raw POST to https://openrouter.ai/api/v1/chat/completions
  → parse SSE `data:` lines
  → accumulate text chunks and tool call deltas
  → yield { type: "text" | "tool_call", ... } to planning loop
```

**Downstream:** Planning loop implementation can now use raw fetch as its LLM
integration layer.

---

## 2. Fork Algorithm

**Status:** RESOLVED

**Resolution:** Implemented in `packages/shared/src/state/fork.ts`. The `fork()` function converts a `ServerState` (flat arrays of channels/roles/overwrites) into a `DesiredState` (keyed `Record<string, ...>`) by constructing new objects with spread copies. Categories are forked as Channel entries in the same `channels` record (type=4 discriminates them). Overwrites are keyed by composite key `channelId:roleId`.

**Downstream:** Diff engine, tool `plan()` functions, and iteration snapshots all use the DesiredState shape.

---

## 3. Planning Loop Implementation Design

**Status:** RESOLVED

**Resolution:** Implemented in `apps/server/src/planning/planning-session.ts`. The `PlanningSession` class orchestrates the LLM → tool dispatch → modify desired state loop. It tracks state via a `status` field (`idle | planning | waiting_for_user | completed | error`), persists iteration snapshots after each LLM turn via an `onTurnComplete` callback, and handles pause/resume with `ask_user`. Messages are saved to `conversations.messages` after each turn. Context window tracking deferred.

**Downstream:** Tool dispatch, conversation persistence, ask_user, SSE streaming, and iteration management all plug into this.

---

## 4. Tool Registry + Dispatch Design

**Status:** RESOLVED

**Resolution:** Implemented in `packages/shared/src/tools/registry.ts`. The `ToolDefinition` interface defines `name`, `description`, `parameters`, `plan()`, and `getAssumptions?()`. All 14 tools are registered in `TOOL_REGISTRY` with Zod schemas, plan functions, and assumption checkers. `getTool(name)` provides lookup. `getOpenAIFunctionDefinitions()` serializes to OpenAI-compatible format. The `PlanningSession.dispatchTool()` method routes tool calls by name, handling ImmediateTool (`ask_user`) vs DeferredTool (all others).

**Downstream:** The entire tool-calling pipeline.

---

## 5. SSE Event Protocol

**Status:** RESOLVED

**Resolution:** Two SSE protocols defined and implemented:

- **Execution events** (`apps/server/src/planning/execution-engine.ts`): `step_started`, `step_completed`, `step_failed`, `step_retry`, `plan_completed`, `plan_failed`, `rollback_started`, `rollback_completed`. Payload includes `planId`, `stepIndex`, `error`, `result`. SSE endpoint at `GET /api/plan/:id/stream`.
- **Planning events** (`apps/server/src/planning/planning-session.ts`): `turn_started`, `tool_called`, `tool_result`, `ask_user`, `completed`, `error`, `expired`. Payload includes `toolName`, `params`, `result`, `question`, `options`, `summary`, `error`. SSE endpoint at `GET /api/conversations/:id/stream`.

Both use heartbeat keep-alive every 30s. Browser auto-reconnection via EventSource standard semantics.

**Downstream:** Frontend Studio UI consumes both SSE streams.

---

## 6. Planning API Contract

**Status:** RESOLVED

**Resolution:** All endpoints implemented in `apps/server/src/hono/routes/conversations.ts` and `plans.ts`:

- `POST /api/guilds/:guildId/conversations` — create conversation + start planning
- `POST /api/guilds/:guildId/conversations/:id/ask-user` — respond to ask_user
- `POST /api/guilds/:guildId/conversations/:id/cancel` — cancel planning
- `POST /api/guilds/:guildId/conversations/:id/approve` — approve → create plan
- `POST /api/guilds/:guildId/conversations/:id/revise` — continue with new prompt
- `POST /api/guilds/:guildId/conversations/:id/revert/:version` — revert to past iteration
- `POST /api/guilds/:guildId/plans/:planId/execute` — execute plan
- `POST /api/guilds/:guildId/plans/:planId/rollback` — rollback executed plan
- `GET /api/conversations/:id/stream` — planning SSE
- `GET /api/plan/:id/stream` — execution SSE

**Downstream:** Frontend can integrate the full planning flow.

---

## 7. System Prompt Architecture

**Status:** RESOLVED

**Resolution:** Implemented in `PlanningSession.buildSystemPrompt()`. The LLM receives:

1. **Role instruction** — "You are a Discord server configuration assistant"
2. **Current server state** — formatted by `formatGuildForLLM()` (channels, roles, overwrites, member count)
3. **Active templates** (Phase 2) — template summaries injected as "Available ideas" when added to context
4. **Server rules** — user-configured constraints from the `rules` table
5. **Guidance** (Phase 2) — markdown files matched to user intent
6. **Tool definitions** — OpenAI-compatible function schemas
7. **Core rules** — inline hardcoded rules (use edit tools, don't delete-and-recreate, etc.)

Section ordering is stable. Guidance and template injection are Phase 2 — the
hardcoded rules cover the critical cases for now. Conversation history truncation
is deferred until needed.

Templates enter the system prompt as structured JSON summaries — not as the starting
DesiredState. The LLM treats them as idea material, not a mandatory merge target.
A dedicated "Merge Template" button sends a crafted merge prompt when the user
wants explicit merging.

**Downstream:** LLM behavior quality. The architecture supports iterative prompt
improvement without code changes.

---

## 8. ask_user State Persistence

**Status:** RESOLVED

**Resolution:** Implemented in `PlanningSession` + `session-manager.ts`. When `ask_user` pauses the planning loop, conversation state persists in server memory. Messages are saved to `conversations.messages` after each turn via `onTurnComplete`. A 2-minute timeout is started on `ask_user` — on expiry the session is cancelled, store reverted to pre-turn snapshot, and conversation status set to `"expired"`. Server restart during an ask_user pause loses in-memory loop state — the user starts a new conversation. Timeout is cleared on `resume()`.

**Downstream:** ask_user tool implementation, conversation messages persistence.

---

## 9. Diff Engine Matching Heuristics

**Status:** CLOSED — Won't fix. Premise is incorrect for current implementation.

**Resolution:** The diff engine does NOT match new items by "name + parent + type." The actual algorithm (see `apps/server/src/planning/diff-engine.ts`) matches by:

- **Existing items** — matched by Discord ID (exact, trivial)
- **New items** — matched by **symbol** (e.g., `$ch_0`, `$role_1`), assigned at creation time

The "open questions" about name similarity thresholds and parent match requirements do not apply because the diff engine never performs fuzzy or heuristic matching. Symbols are identifiers, not names. Position-only changes are handled by comparing the `position` field directly in the diff loop.

This issue was a design sketch from early architecture exploration. The implemented diff engine took a simpler, deterministic approach that does not require heuristic tuning.

**Downstream:** None. The current diff engine is complete.

---

## 10. Plan Optimizer Heuristics

**Status:** CLOSED — Won't fix. Contradicts the 4-layer prevention stack.

**Resolution:** The 4-layer prevention stack (see desired-state-and-diff-engine.md) explicitly rejects algorithmic rename detection:

- **Layer 1** (Tool design): `edit_channel`, `move_channel`, `edit_role` tools exist
- **Layer 2** (LLM guidance): System prompt instructs LLM to use edit tools for renames
- **Layer 3** (Approval UI): Presents deletions and creations side by side with message counts; human judges
- **Layer 4** (Diff engine): Dumb and deterministic — no heuristics, no scoring, no guessing

An auto-converting optimizer would silently override the human's explicit approval, introducing:

- **Trust erosion**: User approved X, system executed Y
- **False positives**: Intentional replacements flagged as accidental renames
- **Maintenance burden**: Per-server heuristic tuning for thresholds

If the LLM repeatedly uses delete+create instead of edit, the fix belongs in Layer 2 (stronger prompt guidance) or Layer 1 (better tool descriptions), not in a heuristic post-processor.

**Downstream:** None. The prevention stack is the complete solution.

---

## 11. planData JSONB Queryability

**Status:** DEFERRED to Phase 2

Plan data stored as single JSONB column — opaque for SQL queries. Cannot efficiently
query "find all plans that touched channel X." Mitigation: `results` array contains
touched Discord IDs.

**Downstream:** Plan history search/audit features.

---

## 12. Desired State Sync on Gateway Events

**Status:** DEFERRED to Phase 2

During long planning sessions, real Discord state may change (other admins, manual changes).
Pre-execution conflict check handles detection at approval time. Re-forking during
planning is Phase 2.

**Downstream:** Pre-execution validation, conflict surfacing UI.

---

## 13. ExecuteContext Design

**Status:** RESOLVED

The `ExecuteContext` interface (in `packages/shared/src/execute-context.ts`) is the abstraction
between tool `execute()` functions and Discord.js REST calls. Decisions:

- **One instance per plan execution.** Wraps a single Discord guild. `guildId` is a readonly
  property set at construction.
- **Stateless.** Does not track what it created or deleted. All tracking (symbol table,
  step results, snapshots) lives in the execution engine layer above.
- **Throws on failure.** All methods throw on Discord API error. Error classification
  (transient vs permanent), retry with backoff, and rollback are the execution engine's
  responsibility.
- **Implementation lives in `apps/server/`.** The interface stays in `packages/shared/` so
  tool functions can reference it without depending on Discord.js.

**Downstream:** Tool `execute()` functions already accept `ExecuteContext`. The implementation
can be built now as a standalone module.

---

## 14. Pre-Execution Conflict Resolution

**Status:** RESOLVED

When pre-execution validation detects conflicts (external changes during planning), execution
is blocked. The user sees a conflict summary and a single action:

**Re-plan with fresh state.** The DesiredState is re-forked from fresh Discord state. The LLM
receives the fresh server state, the full conversation history, a conflict summary, and an
instruction to adapt. The adapted plan produces a new iteration in the same conversation —
preserving context and intent. The user reviews and approves again.

There is no "Force Apply" option. Executing against stale assumptions risks partial state
even with rollback. The exclusive path is to let the LLM repair the plan.

**Downstream:** Pre-execution validation implementation, re-plan loop integration.

---

## 15. Overwrite Diffing — Symmetric or Tombstone-Based

**Status:** RESOLVED

**Resolution:** Symmetric diffing for overwrites — no tombstones.

The original invariant ("every deletion creates a tombstone") applies to channels and
roles, where deletion audit (message counts, hierarchy) has value. Overwrites are
simpler — a composite key with allow/deny arrays, no hierarchy, no audit value.

The diff engine handles overwrite removal by scanning real-state overwrites that are
absent from desired state and emitting `remove_overwrite` steps. This replaces the
tombstone-based approach that channels/roles use with a simpler absent-from-desired
check. No store changes needed (removeOverwrite already deletes from active).

**Downstream:** Diff engine overwrite handling. The store's removeOverwrite now
correctly removes overwrites from Discord.

---

## 16. LLM Call Streaming — Token vs Tool-Call Granularity

**Status:** RESOLVED

**Decision:** Stream at tool-call granularity, not token level.

The original design specified SSE streaming of raw LLM tokens. This adds frontend
complexity (streaming text renderer, token diffing) for minimal UX gain — the user's
actionable information is tool calls, not raw tokens.

**Resolution:**

- Switch `callLLM` to streaming fetch
- Server accumulates thinking text internally, emits once per turn as `thinking` field
  in `turn_completed`
- Tool calls emitted immediately as they're accumulated (`tool_called`/`tool_result`
  events interleaved during the turn)
- Final answer text emitted after tool calls complete (as `answer_chunk` events or
  as the `content` field in `turn_completed`)
- Frontend renders: collapsed thinking block → tool call list → answer text
- New events: `thinking_started`, `thinking_chunk` (server-internal), `answer_chunk`,
  plus `thinking` field on `turn_completed`

**Downstream:** Planning session `callLLM()`, SSE protocol, Studio UI.

---

## 17. Execution Error Handling — No LLM Diagnosis

**Status:** RESOLVED

**Decision:** The LLM is never consulted for execution errors.

The original design suggested "LLM receives error + state + step, suggests cause
and fix" for unknown execution errors. This is rejected.

**Rationale:** The LLM's role ends after planning. Execution is a deterministic
pipeline (diff engine → Discord API). Execution errors mean the plan was wrong
or the world changed — letting the LLM try runtime recovery is dangerous
(destructive attempts, rate limits, infinite loops).

**Resolution:**

- All execution errors handled by hardcoded tiers:
  1. **429** — automatic (Discord.js REST manager)
  2. **500/502/503/timeout** — retry up to 3x with exponential backoff
  3. **403/404/400** — hardcoded diagnosis map in `diagnoseError()`
  4. **Unknown** — fail, full rollback, offer re-plan with fresh state
- Remove "LLM fallback for unknown errors" from execution spec
- The `diagnoseError()` function handles all user-facing error communication

**Downstream:** Execution engine error handling, error display in Studio.

---

## 18. Template System Redesign — Context, Not Conversation-Starter

**Status:** RESOLVED

The original design treated templates as conversation-starters: pick one at
creation, it loads as the initial DesiredState, the LLM merges it. The new
design treats templates as reference material added to the system prompt.

**Resolution:**

- Templates are per-server (via `guildId` FK, already in schema)
- "Add to context" button (conversation-only) injects template summaries into
  the system prompt as "Available ideas" — the LLM uses them freely for inspiration
- "Merge Template" button sends a crafted prompt via `revise`: adapt the template
  to fit the existing server, don't delete without clear conflict
- "View in Studio" opens a read-only template viewer, accessible from:
  - Template library browser
  - Template list sidebar in a conversation
  - Dashboard template detail page
- "Fork & Edit" creates a new template entry immediately, opens an editable Studio,
  auto-saves every edit via the DesiredStateStore snapshot pattern, supports
  revert-to-original and [Discard] (deletes the forked entry)
- Fork naming: "Fork of Gaming Tournament" → auto-suffix on collision:
  "Fork of Gaming Tournament (2)", "Fork of Gaming Tournament (3)", etc.

**Downstream:** Template CRUD routes, Studio template editing mode, system prompt
template injection.

---

## 19. Bot Role Hierarchy — Mandatory Block

**Status:** RESOLVED

**Decision:** The bot MUST be at the highest role position. Any plan that modifies
a role above the bot's own position is BLOCKED at validation time.

The original design treated this as a WARNING with a manual setup step. Partial
state from a failed role edit is worse than blocking upfront — a plan that
partially succeeds (creates channels, but fails on role edits) can't be easily
rolled back.

**Resolution:**

- Validation Group A: compute max position of all existing roles touched by the
  plan (edit_role, delete_role, move_role with real Discord IDs)
- If bot.roles.highest.position < max target position → BLOCK
- Error message: "Bot cannot execute this plan. Its highest role (position X)
  is below a role this plan modifies (position Y). Move the bot's role to the
  top of the role list and try again."
- Same severity level as the ADMINISTRATOR check — both are hard requirements

**Downstream:** Validation pipeline Group A.

---

## 20. Permission Parsing Bug — toCamelCase vs toPascalCase

**Status:** RESOLVED — implementation bug, not design change

`DiscordExecuteContext.parsePermissions()` uses a `toCamelCase()` helper that
converts `VIEW_CHANNEL` → `viewChannel`. But Discord.js v14 `PermissionFlagsBits`
uses PascalCase: `ViewChannel`. The lookup `PermissionFlagsBits["viewChannel"]` always
returns `undefined`, so every role creation and overwrite set silently drops all
permissions.

**Resolution:** Rename `toCamelCase` → `toPascalCase` and fix the conversion to
produce PascalCase output (`ViewChannel`, `SendMessages`, etc.). This is a 5-line
fix in `apps/server/src/bot/execute-context.ts`.

**Downstream:** Bot role hierarchy validation, role permission debugging.

---

## 21. Rollback Stale Cache — Track Created IDs

**Status:** RESOLVED — implementation bug, not design change

`buildCurrentState()` in execution-engine.ts reads from `guildCache` (populated by
gateway events, NOT Discord REST). When `executePlan` creates channels via REST,
the cache is not updated. If rollback fires, the stale cache means `buildCurrentState`
is unaware of newly created channels — the rollback diff is incomplete and channels
survive on Discord.

**Resolution:** Instead of re-diffing from stale cache during rollback, track the
resolved Discord IDs in execution engine's `completedSteps`. During rollback,
directly iterate completed steps in reverse to build inverse operations using
the tracked IDs. This eliminates dependence on cache freshness.

**Downstream:** Execution engine rollback.

---

## 22. Member Role Management — Declarative Model

**Status:** IMPLEMENTED — see [docs/design/member-role-management.md](../design/member-role-management.md)

**Problem:** No tools for member role operations. The LLM can create roles and set
channel overwrites but cannot assign roles to members — a critical gap for server
management.

**Implementation complete:**
- Two new tools: `add_role_to_member` and `remove_role_to_member` (both `planning_and_execution`)
- Member role data model in `DesiredState.active.memberRoles` + `ServerState.memberRoles`
- `fork()` extended to populate member roles from real server state
- `generateMemberRoleSteps()` in diff engine (symmetric diffing, no tombstones)
- ExecuteContext interface + Discord.js implementation for add/remove role from member
- Execution engine dispatch cases for both member tools
- Validation: member existence, bot hierarchy, duplicate checks
- Formatter: role-centric member summary for LLM context
- System prompt: Phase 4 (People) enforcement
- TOOL_ORDER updated: member steps run after role creation, before overwrites

**Remaining for #22:**
- Configuration procedure (#24) — guided setup flow replaced with passive sidebar
- `phaseProgress` JSONB column on guilds table (was originally `guided_setup_completed`)

**Downstream:** Full 4-phase planning model. Member role assignment completes
the planning surface.

---

## 23. lockPermissions — Category-Level Permission Inheritance

**Status:** IN DESIGN (updated 2026-05-28). Full design in [docs/design/member-role-management.md](../design/member-role-management.md#lockpermissions--category-level-permission-inheritance)

**Problem:** Discord's `lockPermissions` channel property allows channels to inherit
their parent category's permission overwrites. Not implemented — the LLM must set
identical overwrites on every channel in a category, wasting tokens and generating
unnecessary diff steps.

**Updated design decisions (2026-05-28):**

- **Reading sync state — heuristic approach.** Discord's REST API does not
  expose a `permissions_locked` boolean. The bot determines sync state by
  comparing a channel's `permission_overwrites` to its parent category's.
  If identical, the channel is synced. Discord's own client uses the same
  comparison. This is applied in `fork()` when populating `ChannelBase`.

- **Auto-de-sync is a safety net.** When the bot modifies overwrites on a
  synced channel, Discord immediately de-syncs it. No error — the channel
  simply becomes independent. If the LLM sets `lock_permissions: true` in
  Phase 2 then a conflicting overwrite in Phase 3, Discord silently handles
  it. The "Fix This" detection catches the mismatch post-execution.

- **Diff engine changes.** `generateOverwriteSteps()` extended to accept
  channel and category data. For synced channels, per-channel overwrite
  generation is skipped entirely (category overwrites handle access).
  When `lockPermissions` changes, `edit_channel` steps are emitted.

- **`arraysEqualSorted` helper.** Channel overwrite comparison uses
  sorted-set equality to handle different ordering of the same permissions.
  Used in both the fork heuristic and the "Fix This" detection.

- **Proactive + reactive consolidation.** The LLM can detect consolidation
  opportunities during planning via `ask_user`. Post-execution, Validation
  Group D detects channels with identical overwrites but `lockPermissions: false`
  and offers one-click [Fix This] via `revise`.

- **8 files** (7 implementation + 1 registry update). All additive. Zero
  conflicts with member roles.

- **Phase 2 (Layout) default.** New channels default to `lock_permissions: true`.
  Permissions set once on the category in Phase 3 (Access Control).

**Downstream:** Permission strategy refinement within Phase 3. Reduces LLM token
usage and diff engine step count for servers with consistent category-level
permission models.

---

## 24. Configuration Procedure — Structured Workflow

**Status:** IN DESIGN — see [docs/design/member-role-management.md](../design/member-role-management.md#configuration-procedure-recommended-workflow)

**Problem:** No structured workflow for server configuration. Users may configure
in any order (roles after channels, permissions before layout), leading to
incoherent plans and LLM confusion. The original "guided setup" design relied on
the LLM as a tour guide — unreliable across models.

**Design decisions:**

- **Passive sidebar checklist.** Always visible in Studio. Shows 4 phases with
  completion status. Never blocks, never nags — just offers structure.
- **Per-phase predefined prompts.** Each phase has a well-crafted scoped prompt
  that explicitly forbids touching resources from other phases. The user clicks
  "[Use prompt →]" to start a new conversation with that prompt.
- **Prompt preview card.** Before sending, the Studio shows the suggested prompt
  in an editable card. User can tweak before sending or approve immediately.
- **Per-phase progress tracking.** `phaseProgress` JSONB on guilds table:
  `{ foundation, layout, access, people }`. Updated when a phase's plan executes.
- **Depreciation warnings.** Reverting to an earlier phase after later phases are
  complete shows a non-blocking warning: "2 channels in that category may be
  affected."
- **Phase exit is implicit.** If the user types their own prompt without using a
  suggested one, the sidebar stays visible but no longer highlights a current
  phase. No explicit "exit" action needed.
- **3 files to change:** DB schema (phaseProgress column), guilds PATCH route,
  Studio sidebar component.

**Downstream:** Cleaner planning sessions, less LLM confusion, better plan quality
through enforced scoping.

---

## Dependency Graph

```
LLM SDK Choice (#1)
       │
       ▼
Fork Algorithm (#2) ──────────────────┐
       │                              │
       ▼                              ▼
Planning Loop (#3) ──────┬── Tool Registry (#4)
       │                 │
       ├─────────────────┼── SSE Protocol (#5)
       │                 │
       └─────────────────┴── Planning API (#6)
                              │
System Prompt (#7) ◄─────────┘ (parallel — can be done anytime)
                              │
Member Roles (#22) ──────────┤ (IMPLEMENTED — extends DesiredState, adds 2 tools, Phase 4)
                              │
Configuration Proc (#24) ────┤ (independent — Studio sidebar + DB tracking)
                              │
lockPermissions (#23) ◄──────┤ (independent — refines Phase 3 only)
                              │
Template Redesign (#18) ─────┤ (system prompt injection)
                              │
Bot Hierarchy (#19) ─────────┤ (validation pipeline)
                              │
Rollback Fix (#21) ──────────┘ (execution engine, independent)
```

**Key decisions settled:**

- #16 (Streaming): Tool-call granularity, not token-level. Thinking held, tools immediate.
- #17 (Error handling): No LLM in execution. Hardcoded tiers only.
- #18 (Templates): System prompt context, not DesiredState starters.
- #19 (Bot hierarchy): Mandatory BLOCK — bot must be the highest role.
- #20 (Perm parsing): PascalCase fix in execute-context.
- #21 (Rollback): Track created IDs, don't re-diff stale cache.
- #22 (Member roles): IMPLEMENTED. 15 files changed. Declarative model, symmetric diffing, Phase 4.
- #23 (lockPermissions): IN DESIGN (updated). Heuristic sync reading, auto-de-sync as safety net, arraysEqualSorted comparison. 8 files.
- #24 (Configuration procedure): IN DESIGN. Passive sidebar, per-phase scoped prompts, prompt preview card. 3 files.
- #23 (lockPermissions): Category-level permission inheritance, post-execution "Fix This" pattern. ~5 files, deferred. Affects LLM permission strategy.

```

```
