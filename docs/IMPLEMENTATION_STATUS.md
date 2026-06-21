# Implementation Status

Last updated: 2026-06-21

Source of truth for what is actually built in this codebase. When a design doc,
issue doc, or comment disagrees with code, this file wins. Update after major
features land.

Legend: `done` (implemented & wired) · `partial` (code present, incomplete wiring) · `placeholder` (UI says "coming soon") · `gap` (no code at all)

## Subsystems

### `apps/server/src/bot/`

- `done` Guild cache + lifecycle — `bot/index.ts` (init, sync on `ChannelCreate/Update/Delete`, `GuildRoleCreate/Update/Delete`, `GuildMemberAdd/Update/Remove`, `GuildCreate/Delete`)
- `done` Client setup — `bot/client.ts` (Discord.js Client, intents, singletons)
- `done` Cache data structure — `bot/cache.ts` (in-memory `guildCache` Map, lookup helpers, `permissionsLocked` reading)
- `done` Permission parsing — `bot/permissions.ts` (`botHasAdministrator`, `bitfieldToPermissionNames`)
- `done` Discord execute-context — `bot/execute-context.ts` (every Discord.js API call the execution engine needs; `toPascalCase` PermissionFlagsBits fix)
- `done` Formatter — `bot/formatter.ts` (server state → LLM text, role-centric member summary)

### `apps/server/src/auth/`

- `done` Better Auth config — `auth/config.ts` (Discord OAuth2, sessions, multi-tenant)
- `done` Middleware — `auth/middleware.ts` (Hono `authMiddleware`, `requireUser`)
- `done` Helpers — `auth/helpers.ts` (`userHasManageGuild`, `DiscordApiError`)

### `apps/server/src/hono/`

- `done` App composition + global error handler — `hono/app.ts` (CORS, rate limit, `botReady` gate, SSE endpoints for plans + conversations)
- `done` Rate limit middleware — `hono/middleware/rate-limit.ts` (sliding window, 100 req/min)
- Routes:
  - `done` `/api/health` — health check (DB + bot readiness)
  - `done` `/api/me` — current user
  - `done` `/api/auth/*` — Better Auth handler
  - `done` `/api/plan/:id/stream` — execution SSE
  - `done` `/api/conversations/:id/stream` — planning SSE
  - `done` `/api/guilds` — `routes/guilds.ts` (list, get, patch with `phaseProgress`, `guidedSetupCompleted`)
  - `done` `/api/guilds/:guildId/rules` — `routes/rules.ts` (full CRUD)
  - `done` `/api/guilds/:guildId` (state subroutes) — `routes/state.ts` (state, channels, roles, drift stream)
  - `done` `/api/guilds/:guildId/plans` — `routes/plans.ts` (list, get, create, execute, abort, rollback)
  - `done` `/api/guilds/:guildId/conversations` — `routes/conversations.ts` (list, get, create, ask-user, cancel, approve, revise, revert, edit-state, template-attach/detach, merge)
  - `done` `/api/guilds/:guildId/templates` — `routes/templates.ts` (list, get, create, update, delete, **merge via LLM**)
  - `done` `/api/bot` — `routes/bot.ts` (status, OAuth invite URL)

### `apps/server/src/planning/`

- `done` Diff engine — `planning/diff-engine.ts` (3-phase: raw steps → topo sort → optimize; lockPermissions skip for synced channels; `arraysEqualSorted` helper; member role symmetric diffing; overwrite symmetric diffing)
- `done` Drift detector — `planning/drift-detector.ts` (periodic poll, compares real Discord state vs cache, persists `driftEvents`)
- `done` Event bus — `planning/event-bus.ts` (pub/sub for execution events per plan)
- `done` Planning event bus — `planning/planning-event-bus.ts` (pub/sub per conversation for streaming LLM events)
- `done` Execution engine — `planning/execution-engine.ts` (resolveSymbols, isTransientError/isKnownError, exponential backoff with jitter, hardcoded `diagnoseError`, `getInverseTool` for rollback, tracked completed-step Discord IDs)
- `done` Guild access check — `planning/guild-check.ts` (admin + bot-in-guild check)
- `done` LLM HTTP — `planning/llm-request.ts` (raw POST to OpenRouter-compatible endpoint, configurable via `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`)
- `done` Stream parser — `planning/stream-parser.ts` (SSE chunk parsing, tool-call delta accumulation, thought/answer separation)
- `done` Locking — `planning/locking.ts` (per-guild execution locks, stale-lock recovery at boot, periodic cleanup)
- `done` Planning session — `planning/planning-session.ts` (LLM loop, `buildSystemPrompt` with 4-phase model + PERMISSION STRATEGY, ask_user pause/resume, message windowing, `callLLM`)
- `done` Session manager — `planning/session-manager.ts` (in-memory `PlanningSession` registry + ask_user timeouts)
- `done` Snapshot cleanup — `planning/snapshot-cleanup.ts` (background job, removes orphaned `plan_iterations`)
- `done` Validation — `planning/validation.ts` (Groups A–E: bot hierarchy, ADMINISTRATOR, Discord ID integrity, overwrite consolidation detection, role hierarchy; Stage 2 LLM policy check against `rules` table via `validateWithLLM`)

### `apps/server/src/`

- `done` Process entry — `index.ts` (Hono serve, migrations, bot login, background jobs, drift detector lifecycle)
- `done` Migrations — `migrate.ts` (runs pending Drizzle migrations on boot)
- `done` Env validation — `env.ts` + `env-validated.ts` (Zod-validated, fails fast on missing required vars)
- `done` Logger — `utils/logger.ts` (pino + pino-pretty)
- `done` App types — `types.ts` (`AppVariables` for Hono context)

### `packages/shared/src/`

- `done` Types — `types.ts` (`ChannelBase`, `Role`, `PermissionOverwrite`, `ServerState`, `DesiredState`, `PlanStep`, `MemberRole`, `RoleTags`, `OverwriteKey`, `Tombstone`, `DiscordExecuteContext`, `BotConfig`)
- `done` Constants — `constants.ts` (permission enums, `bitfieldToPermissionNames`, `permissionNamesToBitfield`, `parsePermissionString`, `TOOL_ORDER` for topological sort, `DISCORD_PERMISSIONS`, `MAX_RETRIES`)
- `done` Execute context interface — `execute-context.ts` (the contract every `execute()` function depends on; implemented in `apps/server/src/bot/execute-context.ts`)
- `done` Server-state hashing — `hash-server-state.ts` (stable stringify + SHA-256 for `forkStateHash` stale-detection)
- `done` State store — `state/desired-state-store.ts` (CRUD, validation, symbol generation, fork, snapshot, revert; all `addX`/`editX`/`removeX` go through this)
- `done` Fork — `state/fork.ts` (`ServerState` → `DesiredState`; reads `permissionsLocked` for `lockPermissions`; member role population)
- `done` Tool registry — `tools/registry.ts` (17 tools: 4 category, 4 channel, 4 role, 3 permission, 2 member, 1 interaction; `getTool`, `getOpenAIFunctionDefinitions`)
- `done` Tool implementations:
  - `tools/categories.ts` — create/edit/delete
  - `tools/channels.ts` — create/edit/delete/move (with `lock_permissions`, forum/media properties, `default_reaction_emoji`, `default_sort_order`, `default_forum_layout`, `default_thread_rate_limit_per_user`, `flags`, `available_tags`)
  - `tools/roles.ts` — create/edit/delete/move
  - `tools/permissions.ts` — set/remove/batch_set_overwrite
  - `tools/members.ts` — add/remove role from member
  - `tools/interaction.ts` — ask_user (the only ImmediateTool)
- `done` Assumption evaluator — `tools/evaluate-assumptions.ts` (pre-execution validation: parent exists, no name conflict, bot hierarchy, etc.)
- `done` Zod schemas — `zod-schemas.ts` (shared schema fragments)

### `packages/db/src/`

- `done` Drizzle client — `index.ts` (`db`, `queryClient`)
- `done` Schema tables — `schema.ts`:
  - `users`, `sessions`, `accounts`, `verifications` (Better Auth)
  - `guilds` (incl. `phaseProgress` JSONB, `guidedSetupCompleted`)
  - `conversations` (LLM chat audit log, `forkStateHash`, status)
  - `planIterations` (DesiredState snapshots, version, `llm_generated` | `manual`)
  - `plans` (planData JSONB, results, status, rollback tracking)
  - `snapshots` (server-state snapshots for rollback)
  - `rules` (server rules consumed by Stage 2 LLM validation)
  - `templates` (template structure JSONB, per-guild)
  - `driftEvents` (drift detector persistence)
- `done` Relations — all `*Relations` defined

### `apps/web/src/` — Routes

- `done` Login — `routes/Login.tsx` (Better Auth sign-in via Discord)
- `done` Studio — `routes/Studio.tsx` (the Discord-like preview; SSE consumption; iteration history; live desired-state view; ProcedureSidebar; TemplatePanel; ActionBar; ExecutionStatus)
- `done` Templates list — `routes/Templates.tsx`
- `done` Template editor — `routes/TemplateEditor.tsx`
- `done` 404 — `routes/NotFound.tsx`
  - `partial` Dashboard — `routes/Dashboard.tsx` (plan history, templates link, rules CRUD via `RulesSection`; only "notification settings" still placeholder)
  - `partial` Setup — `routes/Setup.tsx` (route exists, mostly placeholder)

### `apps/web/src/` — Components

- `done` AppHeader — `components/AppHeader.tsx`
- `done` AppLayout — `components/AppLayout.tsx`
- `done` EmptyState — `components/EmptyState.tsx`
- `done` ActionBar — `components/ActionBar.tsx` (approve/cancel/revise actions)
- `done` DesiredStateView — `components/DesiredStateView.tsx` (Discord-like preview of channels/categories/roles/members/tombstones)
- `done` ExecutionStatus — `components/ExecutionStatus.tsx` (live step status)
- `done` IterationHistory — `components/IterationHistory.tsx` (past iterations, revert button)
  - `done` ProcedureSidebar — `components/ProcedureSidebar.tsx` (4-phase checklist, phase prompts, deprecation warnings)
  - `done` RulesSection — `components/RulesSection.tsx` (Dashboard CRUD UI for server rules; add/edit/delete, used by Stage 2 LLM validation)
- `done` TemplatePanel — `components/TemplatePanel.tsx` (attach/detach/merge UI in Studio)
- `done` Desired-state primitives — `components/desired-state/` (CategoryList, ChannelList, RoleList, MemberList, TombstoneList, DiffBadge, diff utilities)
- `done` API client — `lib/api.ts`
- `done` Auth client — `lib/auth.ts`

### `apps/web/src/` — Stores (Zustand)

- `done` `useAuthStore` — `stores/authStore.ts`
- `done` `useStudioStore` — `stores/studioStore.ts` (active conversation, desired state, plan steps, SSE events)
- `done` `useDashboardStore` — `stores/dashboardStore.ts`

### Tests

34 test files across the monorepo. Highest-value targets per `AGENTS.md` testing strategy:

- `done` `apps/server/src/planning/diff-engine.test.ts` — 3-phase diff algorithm, edge cases
- `done` `apps/server/src/planning/validation.test.ts` — Groups B–E (pure functions)
- `done` `apps/server/src/planning/execution-engine.test.ts` — resolveSymbols, error classification, backoff, inverse tools
- `done` `apps/server/src/planning/locking.test.ts` — Drizzle `db` mock
- `done` `apps/server/src/planning/integration.test.ts` — full planning flow
- `done` `apps/server/src/planning/llm-request.test.ts` — HTTP layer
- `done` `apps/server/src/planning/stream-parser.test.ts` — SSE parsing
- `done` `apps/server/src/planning/drift-detector.test.ts` — periodic poll + persistence
- `done` `apps/server/src/bot/formatter.test.ts` — guild cache → LLM text
- `gap` `packages/shared/src/state/desired-state-store.test.ts` — CRUD, validation, symbol generation (mentioned in AGENTS.md priority 1, not present)
- `gap` `packages/shared/src/state/fork.test.ts` — ServerState → DesiredState
- `gap` `packages/shared/src/constants.test.ts` — permission parsing
- `gap` `packages/shared/src/hash-server-state.test.ts` — stable stringify + hashing
- `gap` `packages/shared/src/tools/*.test.ts` — plan functions, assumptions, execute with mock ctx
- `gap` `packages/shared/src/tools/registry.test.ts` — registry invariants
- `gap` `packages/shared/src/zod-schemas.test.ts` — schema parse/safeParse
- `gap` `apps/web/src/components/desired-state/diff-utils.test.ts` (file present, but app component tests minimal)
- `gap` `apps/server/src/hono/routes/*.test.ts` — Hono route tests
- `gap` `apps/web/src/**/*.test.tsx` — React component tests with jsdom

## Known Gaps

- `partial` **Dashboard page** — `apps/web/src/routes/Dashboard.tsx` now has plan history, templates link, and rules CRUD. Still placeholder: notification settings.
- `partial` **Setup page** — `apps/web/src/routes/Setup.tsx` is mostly placeholder. Needs guided server configuration wizard.
- `partial` **`shared` package tests** — `packages/shared` has zero test files. AGENTS.md marks it priority 1. Pure logic, no mocks needed.
- `partial` **React component tests** — `apps/web` has minimal component tests. AGENTS.md marks priority 4.
- `partial` **Hono route tests** — Thin orchestrators, lower priority per AGENTS.md, but still gap.

## Deferred (Phase 2+)

See `docs/issues/open-design-issues.md` for the full log.

- **#11** `planData` JSONB queryability — currently opaque to SQL; `results` array has touched Discord IDs
- **#12** Desired-state re-fork mid-planning — conflict detection at approval time, re-fork during planning is Phase 2
- **#7** System-prompt architecture refinements (template injection already wired, guidance file loading deferred)

## Recently resolved (since May 28, 2026)

- `done` **lockPermissions** — full design + 8 files (types, channels, registry, store, fork, execute-context, diff-engine, validation). Per-channel skip for synced channels; `arraysEqualSorted` helper; validation Group D detects identical-overwrite un-synced channels.
- `done` **Member role management** — 2 tools, `memberRoles` in active state, symmetric diffing, Phase 4 enforcement, `getInverseTool` for rollback, formatter summary.
- `done` **Configuration procedure** — `ProcedureSidebar` + `phaseProgress` JSONB + deprecation warnings + per-phase scoped prompts.
- `done` **LLM policy validation (Stage 2)** — `validateWithLLM` calls LLM with rules + plan summary, structured JSON response.
- `done` **Drift detector** — periodic poll, persists `driftEvents`, `/api/guilds/:guildId/drift/stream` SSE.
- `done` **Rate limiting** — sliding window, 100 req/min, applied to `/api/*`.
- `done` **Env validation** — Zod schema, fail fast at boot.
- `done` **Locks + snapshot cleanup** — periodic background jobs, stale recovery on boot.
- `done` **State routes** — `/api/guilds/:guildId/state|channels|roles|drift/stream` mounted under parent route (no double-guildId bug).
- `done` **Template merge** — LLM-driven merge via `revise`-style flow, reuses `PlanningSession`.
- `done` **Edit state endpoint** — manual edits to desired state via API (`POST /conversations/:id/edit-state`).
- `done` **Template attach/detach** — `POST/DELETE /conversations/:id/templates/:templateId`.
- `done` **Rules CRUD UI** — `RulesSection` component in Dashboard; add/edit/delete rules consumed by `validateWithLLM`. Replaces "coming soon" placeholder.

## Drift between docs and code

- `docs/issues/remaining-fixes.md` lists 5 fixes — **all five are now done** in code, but the doc wasn't updated. This file is the corrected view.
- `docs/issues/remaining-fixes.md` says "Zero test files" — **34 test files exist** (see Tests section above).
- `docs/issues/channel-role-gaps.md` Gap 7 (lockPermissions) status was "IN DESIGN" — **now implemented**, see Recently resolved.
- `AGENTS.md` env vars table (line 236) lists `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` — code uses `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` (see `.env.example`).
- `docs/design/overview.md` mentions `apps/docs/` (Astro SSG) — **does not exist** in directory tree.
