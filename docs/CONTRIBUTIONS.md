# Contributions — Discord Platform

Custom work I built myself, versus library/API integrations I wired and adapted
to serve the platform's goals. Focused on the algorithm and data-model layers;
UI scaffolding (Vite/React setup), frontend components, and client-side stores
are out of scope here.

---

## 1. Core Engine — the algorithm

The runtime decision loop. Everything below is hand-written TypeScript — no
framework, no SDK. All paths above `fetch` are mine.

### 1.1 Three-phase diff engine
**`apps/server/src/planning/diff-engine.ts`** — 673 lines

Compares a `DesiredState` (what the admin described) to a `ServerState` (what
Discord currently has) and emits a `PlanStep[]`. Three phases:

1. **Phase 1 — Generate raw steps.** Iterate channels / roles / overwrites /
   member-roles, classify each as create / edit / delete / move / no-op. New
   entities get a `$symbol` placeholder; existing IDs are referenced directly.
2. **Phase 2 — Topological sort.** Order by `TOOL_ORDER` (create_category < … <
   delete_category) and by symbol dependencies (a channel referencing
   `$category1` must come after that category's create step). Cyclic symbol
   references are rejected.
3. **Phase 3 — Optimize.** Merge consecutive edits on the same target into a
   single step; prune no-ops (e.g. an "edit" whose params match the current
   state); detect overwrite consolidation (a `set_overwrite` that's immediately
   replaced by another on the same channel+role).

Edge cases handled:
- `lockPermissions` skip for synced channels (don't emit redundant overwrite
  steps when a channel inherits from its parent category) — uses an
  `arraysEqualSorted` helper.
- Member-role symmetric diff — only emit `add_role_to_member` /
  `remove_role_from_member` for the diff, not the full set each time.
- Overwrite symmetric diff — same pattern for permission overwrites.

This is the single most algorithmically dense file in the codebase and is
testable without any Discord or LLM mocks.

### 1.2 Execution engine
**`apps/server/src/planning/execution-engine.ts`** — 543 lines

Runs a validated `PlanStep[]` against live Discord via the `ExecuteContext`
interface. Built pieces:

- **`resolveSymbols`** — replaces every `$symbol` in step params with the real
  Discord ID captured from a previous step's result. Maintains a
  `SymbolTable` as steps complete.
- **Error classification** — `isTransientError` (429 / 500 / network / timeout)
  vs. `isKnownError` (known Discord API error codes). Drives retry decisions.
- **`computeBackoff`** — exponential backoff with jitter, capped at
  `MAX_RETRIES`.
- **`diagnoseError`** — maps raw error strings to human-readable messages
  (currently a hardcoded table).
- **`getInverseTool`** — for rollback. Every `create_*` has a matching
  `delete_*`; `add_role_to_member` ↔ `remove_role_from_member`; `set_overwrite`
  ↔ `remove_overwrite`. Used to undo steps already executed when a later step
  fails.
- Tracked completed-step Discord IDs so the live state can be reconstructed
  even if execution aborts mid-plan.

### 1.3 Planning session
**`apps/server/src/planning/planning-session.ts`** — 631 lines

The LLM tool-calling loop that turns a user's natural-language request into a
`PlanStep[]`. Hand-written, no SDK:

- 4-phase system prompt (Goal → Tool Selection → Permissions → Format) with
  explicit PERMISSION STRATEGY block.
- LLM loop: call `callLLM` → parse streaming tool calls → dispatch each tool's
  `plan()` function → feed results back → repeat until the LLM emits a
  terminal answer.
- `ask_user` pause/resume — pauses the session, emits an SSE event, waits for
  the user's reply, resumes with the reply injected. Has a timeout that
  re-claims dead sessions.
- Message windowing — `trimMessages` keeps a fixed-size recent window. The
  current implementation is a dumb slice; the plan is to replace this with a
  quick-model summarization agent (see §7).
- `callLLM` — raw `fetch` against an OpenAI-compatible endpoint, with
  `AbortController` cancel handling.

### 1.4 Validation pipeline
**`apps/server/src/planning/validation.ts`** — 595 lines, two stages

**Stage 1 — hard-coded structural checks (no LLM),** five groups:

| Group | Check |
|---|---|
| A: Bot hierarchy | bot role >= affected role for every step |
| B: Resource constraints | channel/role count limits, name length |
| C: Dependency integrity | parent IDs referenced exist; no orphan |
| D: Overwrite consolidation | gap when an un-synced channel has repeating overwrites |
| E: Plan integrity | symbol table closed; every referenced `$symbol` produced by a prior step |

**Stage 2 — LLM policy check (`validateWithLLM`),** against the guild's
user-authored `rules` table. Single-shot structured-JSON call (no tool
calling). Returns `{ violations: [{ rule, severity, message }] }`. The
likely candidate for the cheap-model tier work: it's a short, structured,
no-tool job.

### 1.5 Drift detector
**`apps/server/src/planning/drift-detector.ts`**

Background job that polls a guild's real Discord state on an interval, diffs
against the cached state, persists any divergence into a `driftEvents` row,
and streams events to any subscribed client over SSE. Used by the Studio's
"Re-fork" toast. Tested with fake timers.

### 1.6 Locks & snapshot cleanup
**`apps/server/src/planning/locking.ts`**, **`planning/snapshot-cleanup.ts`**

- Per-guild execution locks (only one plan runs per guild at a time).
  Stale-lock recovery at boot, periodic cleanup of dead locks.
- Snapshot-cleanup background job that removes orphaned `plan_iterations`
  snapshots once their parent plan is older than a threshold.

### 1.7 LLM HTTP + stream parser
**`apps/server/src/planning/llm-request.ts`** — 59 lines
**`apps/server/src/planning/stream-parser.ts`** — 189 lines

- `buildLLMRequest` — provider-agnostic OpenAI-compatible request builder.
  Sends OpenRouter-specific headers (`HTTP-Referer`, `X-Title`) only when the
  base URL is `openrouter.ai`; otherwise stays clean so self-hosted endpoints
  (Ollama, vLLM, LM Studio) work without customization.
- `parseOpenRouterStream` — hand-written SSE parser. Decodes the
  `ReadableStream`, buffers `data:` lines, accumulates thinking text and
  tool-call argument deltas (the parts of streaming tool-calls that arrive
  in fragments), invokes `onToolCall` per completed call, and returns the
  assembled result when the stream closes.

**This is the part the manager flagged as the algorithm contribution:** zero
LLM SDKs in `package.json`. No `openai`, no `@anthropic-ai/sdk`, no `ai`. The
OpenAI-compatible HTTP layer and the SSE stream parser are both hand-rolled.

---

## 2. Data Model & State

### 2.1 Desired-state store
**`packages/shared/src/state/desired-state-store.ts`** — 400 lines

The single funnel through which every `addX` / `editX` / `removeX` mutates a
`DesiredState`. Owns:

- CRUD with validation (no duplicate names, no orphan parents, no edit on
  tombstoned IDs).
- **Symbol generation** — `$channel1`, `$role2`, … for entities that don't
  exist yet in Discord. Increments a per-state `symbolCounter`.
- **Fork** — snapshot a fresh `DesiredState` from a live `ServerState`.
- **Snapshot** / **revert** — version snapshots for the "Revert to this
  iteration" feature in the Studio UI.

### 2.2 ServerState → DesiredState fork
**`packages/shared/src/state/fork.ts`** — 44 lines

The single point where live Discord state becomes a planning substrate.
Flat arrays + real Discord IDs → keyed records + `symbolCounter: 0`.
Reads `permissionsLocked` to precompute which channels should skip overwrite
steps when they're synced to their parent category.

### 2.3 Stable state hashing
**`packages/shared/src/hash-server-state.ts`**

Deterministic stringify + SHA-256 over a `ServerState`. Used to compute
`forkStateHash` — persisted on conversation fork, compared on approve. If the
hash mismatches at approve time, the plan is rejected and the user is asked
to re-fork (catches mid-planning drift).

### 2.4 Type system & constants
**`packages/shared/src/types.ts`**, **`packages/shared/src/constants.ts`**

- Domain types: `ChannelBase`, `Role`, `PermissionOverwrite`,
  `MemberRoleAssignment`, `ServerState`, `DesiredState`, `PlanStep`,
  `Tombstone`, `DiscordExecuteContext`, `BotConfig`.
- `bitfieldToPermissionNames` / `permissionNamesToBitfield` /
  `parsePermissionString` — bi-directional Discord permission parsing.
- `TOOL_ORDER` map for topological sort.
- `DISCORD_PERMISSIONS` enum, `MAX_RETRIES`.

### 2.5 Zod schemas
**`packages/shared/src/zod-schemas.ts`** — shared parse fragments.

---

## 3. Discord Side Glue

### 3.1 Guild cache + lifecycle
**`apps/server/src/bot/cache.ts`**, **`apps/server/src/bot/index.ts`**

In-memory `guildCache: Map<guildId, ServerState>` populated lazily on first
access and kept fresh by Discord event subscriptions:
`ChannelCreate/Update/Delete`, `GuildRoleCreate/Update/Delete`,
`GuildMemberAdd/Update/Remove`, `GuildCreate/Delete`. Cache hits keep us from
hammering the Discord REST API during planning.

### 3.2 Discord execute-context
**`apps/server/src/bot/execute-context.ts`** — 386 lines

The interface every tool's `execute()` function calls. Wraps every Discord.js
Guild API the execution engine needs (create / edit / delete / move channel /
role / category, set / remove overwrite, add / remove member role) behind a
single contract. Two reasons this matters:

- The execution engine (§1.2) becomes fully mockable — tests just pass a
  plain object with `vi.fn()`s.
- Includes the `toPascalCase` PermissionFlagsBits workaround for a Discord.js
  quirk where some PermissionFlagsBits keys are camelCase instead of PascalCase.

### 3.3 Tool registry & 17 tools
**`packages/shared/src/tools/registry.ts`** — 545 lines
**`packages/shared/src/tools/{categories,channels,roles,permissions,members,interaction}.ts`**

The tool set the LLM planner can invoke. Each tool ships three functions:
- `plan(...)` — mutates the `DesiredState` (no side effects).
- `assumptions(...)` — pre-execution validation + remote state queries.
- `execute(...)` — actual Discord API call via `ExecuteContext`.

17 tools:

| Category | Tools |
|---|---|
| Categories (4) | create / edit / delete / move |
| Channels (4) | create / edit / delete / move (with `lock_permissions`, forum/media properties, `default_reaction_emoji`, `default_sort_order`, `default_forum_layout`, `default_thread_rate_limit_per_user`, `flags`, `available_tags`) |
| Roles (4) | create / edit / delete / move |
| Permissions (3) | set_overwrite / remove_overwrite / batch_set_overwrite |
| Members (2) | add_role_to_member / remove_role_from_member |
| Interaction (1) | ask_user (the only `ImmediateTool`, pauses the planning loop) |

`getOpenAIFunctionDefinitions` exports the registry as OpenAI function-call
schemas for the LLM request body.

### 3.4 Assumption evaluator
**`packages/shared/src/tools/evaluate-assumptions.ts`**

Pre-execution validation that the runtime calls before each step runs. Checks:
parent category exists before creating a child channel, no name conflict for
new channels/roles, bot's role is higher than the role being modified, etc.
Failures abort execution with a structured error.

### 3.5 Permission parsing
**`apps/server/src/bot/permissions.ts`**

- `botHasAdministrator(guild)` — checks the bot's own role for ADMINISTRATOR.
- `bitfieldToPermissionNames` — used by the formatter (§3.6) to turn a
  permission bitfield into human-readable names.

### 3.6 Server-state formatter
**`apps/server/src/bot/formatter.ts`**

`ServerState` → plain-text summary the LLM consumes as context. Role-centric
member summary (per-role, which members hold it). Pure code, no LLM.

---

## 4. Backend Wiring (brief)

| Piece | File | Note |
|---|---|---|
| Hono app composition | `apps/server/src/hono/app.ts` | CORS, rate-limit middleware, `botReady` gate, SSE endpoints for plans + conversations, global error handler |
| Routes (7 files) | `apps/server/src/hono/routes/*.ts` | `guilds`, `state`, `plans`, `conversations`, `rules`, `templates`, `bot`. Plan CRUD + execute/abort/rollback, conversation lifecycle (ask_user / approve / revise / revert / edit-state / template-attach / merge) |
| Rate limiter | `hono/middleware/rate-limit.ts` | Sliding window, 100 req/min |
| Auth | `apps/server/src/auth/` | Better Auth config + `userHasManageGuild` helper (joins Better Auth session → Discord API member check) |
| Env validation | `apps/server/src/env.ts` + `env-validated.ts` | Zod schema, fail fast at boot |
| Process entry | `apps/server/src/index.ts` | Hono serve + bot login + migrations + drift-detector lifecycle + background jobs |

---

## 5. Database

**`packages/db/src/schema.ts`** — Drizzle ORM schema, designed by hand. All
tables follow `id` / `createdAt` / `updatedAt`, snake_case column names with
double-quoted strings, explicit `.references(() => otherTable.id)` foreign keys,
and separate `relations()` definitions.

| Table | Purpose |
|---|---|
| `users` / `sessions` / `accounts` / `verifications` | Better Auth's standard tables (schema defined by us) |
| `guilds` | Per-guild config incl. `phaseProgress` JSONB and `guidedSetupCompleted` flag |
| `conversations` | LLM chat audit log, `forkStateHash` for stale detection, status |
| `planIterations` | DesiredState snapshots, version counter, `llm_generated` \| `manual` provenance |
| `plans` | Plan JSONB, results array, status, rollback tracking |
| `snapshots` | Full server-state snapshots for rollback |
| `rules` | Server rules consumed by Stage 2 LLM validation |
| `templates` | Template structure JSONB, per-guild |
| `driftEvents` | Drift detector persistence |

All relations defined in the same file. Client (`db`, `queryClient`)
re-exported from `packages/db/src/index.ts`.

---

## 6. Libraries / APIs Integrated and Modified

Every library below is wired through code I wrote; the table shows what each
provided and what I built on top to make it serve the platform.

| Library / API | Used as | What I added on top |
|---|---|---|
| **Discord.js v14** | Bot framework | Wrapped every guild API call behind the `DiscordExecuteContext` interface (`execute-context.ts`) so the execution engine is fully testable without Discord.js. Wrote `guildCache` + 11 event subscriptions, permission bitfield ↔ name parsing, and the `toPascalCase` PermissionFlagsBits workaround for a Discord.js naming quirk. |
| **Hono** | HTTP framework | Custom app composition with global error handler, custom sliding-window rate-limit middleware, and SSE endpoints that pair with `event-bus.ts` / `planning-event-bus.ts` for plan + conversation streaming. |
| **Better Auth** | Auth | Discord OAuth2 provider config, custom `userHasManageGuild` helper that joins a Better Auth session to a Discord API member check, and Hono middleware. |
| **Drizzle ORM** | DB layer | Schema design (10 tables, all relations), migrations. Raw SQL only for Better Auth's pre-existing `account` table. |
| **PostgreSQL 16** | DB | Docker compose for local dev; the locking + snapshot-cleanup background jobs lean on Postgres via Drizzle. |
| **OpenRouter (raw `fetch`)** | LLM provider | **No SDK used.** Hand-wrote `buildLLMRequest` (provider-agnostic OpenAI-compatible request builder, OpenRouter headers only when URL matches) and `parseOpenRouterStream` (SSE parser with tool-call delta accumulation). Env vars are intentionally generic (`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`) so the same code works against OpenAI, Together, Groq, Ollama, vLLM, LM Studio — anything that speaks the chat-completions shape. |
| **Zod** | Validation | Env schema (fail-fast at boot), API request/response schemas, tool param schemas, `validateWithLLM` JSON-response schema. |
| **Vitest** | Test runner | 34 test files. Mocks Discord.js via a 5-category factory (Client / Guild / Channel / Role / Member + constants) and the `ExecuteContext` interface via plain `vi.fn()` objects so ~60% of server logic is testable with no real Discord or LLM. |

**Note on what's not in `package.json`:** no `openai`, no
`@anthropic-ai/sdk`, no `ai`, no `@openrouter`. The entire LLM transport is
hand-rolled. Compared to the typical "import the SDK, call chat.completions"
approach, this gives provider portability, smaller transitive deps, and
direct control over streaming / abort / retry — at the cost of owning the
OpenAI-compatible request and SSE parsing code.

---

## 7. Planned Next Step — Multi-tier Model Router

Currently every LLM call uses the same `LLM_MODEL` env var, frontier-grade by
default. Two of the work categories are genuinely cheap-model-shaped:

| Work | Site | Tier fit | Why |
|---|---|---|---|
| Main planning | `callLLM` in `planning-session.ts:382` | **Frontier** | Multi-step tool calling, complex 4-phase system prompt, long context |
| Stage 2 policy validation | `validateWithLLM` in `validation.ts:476` | **Quick** | Single-shot JSON, no tool calling, short prompt — frontier-grade is overkill |
| Conversation history summarization (new) | replaces `trimMessages` at `planning-session.ts:375` | **Quick** | Summarize dropped messages into a compact context block instead of slicing silently |

**The algorithm I plan to build:**

- `AgentRouter` with `resolveTier(workDescriptor): Tier` (pure function) and
  `dispatch(workDescriptor, request): Promise<LLMResponse>`.
- Classification rules: `hasToolCalling` → frontier; `expectsStructuredJson &&
  !hasToolCalling && contextSize !== "large"` → quick; `contextSize === large`
  → frontier.
- Per-tier config (`LLM_MODEL_PLANNING` / `LLM_MODEL_VALIDATION`), per-tier
  request shaping (`max_tokens`, optional `response_format`), a fallback policy
  (quick fails → escalate to frontier, log loudly), and a per-call cost log.

**Scope:** ~150 lines, touches no diff engine, no execution engine, no UI.
The classification function is the real algorithm; the model swap is config
on top.

---

## File index — places I made substantive contributions

```
packages/shared/src/
  state/desired-state-store.ts        # state store
  state/fork.ts                       # ServerState -> DesiredState
  tools/registry.ts                   # 17-tool registry
  tools/{categories,channels,roles,permissions,members,interaction}.ts  # tool impls
  tools/evaluate-assumptions.ts       # pre-exec validation
  types.ts, constants.ts, zod-schemas.ts, execute-context.ts, hash-server-state.ts

apps/server/src/
  planning/diff-engine.ts             # 3-phase diff engine
  planning/execution-engine.ts        # symbol resolution, retry, inverse tools
  planning/planning-session.ts        # LLM loop, ask_user, windowing
  planning/validation.ts              # Stage 1 (hard-coded) + Stage 2 (LLM)
  planning/drift-detector.ts
  planning/locking.ts, snapshot-cleanup.ts, event-bus.ts, planning-event-bus.ts
  planning/llm-request.ts, stream-parser.ts  # hand-rolled HTTP + SSE
  bot/cache.ts, index.ts, execute-context.ts, permissions.ts, formatter.ts
  hono/app.ts, hono/routes/*.ts, hono/middleware/rate-limit.ts
  auth/{config,middleware,helpers}.ts
  env.ts, env-validated.ts, index.ts
  utils/logger.ts

packages/db/src/
  schema.ts, index.ts
```
