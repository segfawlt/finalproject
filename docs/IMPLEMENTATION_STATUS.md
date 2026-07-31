# Implementation Status

Last updated: 2026-07-29

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

- `done` Better Auth config — `auth/config.ts` (Discord OAuth2, sessions; `subscriptionTier` field present but unused — no multi-tenant/RBAC)
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
  - `done` `/api/guilds` — `routes/guilds.ts` (list, get, patch with `serverType`, `settings`)
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
- `done` Execution engine — `planning/execution-engine.ts` (resolveSymbols, isTransientError/isKnownError, exponential backoff with jitter, hardcoded `diagnoseError`, diff-based `rollbackFull` for rollback (recomputes reverse diff from live state vs before-snapshot), tracked completed-step Discord IDs, per-step deadline via `dispatchWithDeadline` — `StepTimeoutError` retryable / `StepAbortedError` terminal, abort-aware so plan-level timeout interrupts mid-step)
- `done` Guild access check — `planning/guild-check.ts` (admin + bot-in-guild check)
- `done` LLM HTTP — `planning/llm-request.ts` (raw POST to OpenRouter-compatible endpoint, configurable via `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`)
- `done` Stream parser — `planning/stream-parser.ts` (SSE chunk parsing, tool-call delta accumulation, thought/answer separation)
- `done` Locking — `planning/locking.ts` (per-guild execution locks, stale-lock recovery at boot, periodic cleanup)
- `done` Planning session — `planning/planning-session.ts` (LLM loop, `buildSystemPrompt` with 4-phase model + PERMISSION STRATEGY, `ask_user`-specific pause/resume, planning-only batch tools continue the loop, message windowing, `callLLM`)
- `done` Session manager — `planning/session-manager.ts` (in-memory `PlanningSession` registry + ask_user timeouts)
- `done` Snapshot cleanup — `planning/snapshot-cleanup.ts` (background job, removes orphaned `plan_iterations`)
- `done` Validation — `planning/validation.ts` (Groups A–E: perm-name validity, ADMINISTRATOR + strict bot role-hierarchy including equal-position targets, symbol resolution + **symbol-type matching**, DAG/cycle, duplicate names, member-role dedupe, category child cap, topic/**bitrate** channel-type constraints, ADMINISTRATOR-grant block, overwrite-consolidation warning; Stage 2 LLM policy check against `rules` table via `validateWithLLM`)
  - `gap` **Server rules run at execution, not planning.** Design intends rules in the planning prompt (`buildSystemPrompt`); code enforces them at execution via `validateWithLLM`. Enforcement model (prompt-only vs prompt+backstop) is an open decision — see `docs/design/validation-and-safety.md` Stage 2.
  - `done` **Confirmed AI re-plan for stale plans.** `POST /plans/:planId/replan` re-forks from current Discord state and starts a fresh `PlanningSession` with persisted conversation context, prior desired state, and structured conflicts. Studio offers it only after a stale execution conflict; repaired plans always return to review before execution.
  - `note` Deliberately **not** validated (documented in the design doc): per-action bot perms (redundant with ADMINISTRATOR), role-position ordering among movable roles, IMPORTANT-channel / delete-all-from-category guards (conflict with "present, don't judge"), bot-own-permission lockout (impossible under ADMINISTRATOR), planData Zod check (internal deterministic data).

### `apps/server/src/`

- `done` Process entry — `index.ts` (Hono serve, migrations, bot login, background jobs, drift detector lifecycle)
- `done` Migrations — `migrate.ts` (runs pending Drizzle migrations on boot)
- `done` Env validation — `env.ts` + `env-validated.ts` (Zod-validated, fails fast on missing required vars)
- `done` Logger — `utils/logger.ts` (pino + pino-pretty)
- `done` App types — `types.ts` (`AppVariables` for Hono context)

### `packages/shared/src/`

- `done` Types — `types.ts` (`ChannelBase`, `Role`, `PermissionOverwrite`, `ServerState`, `DesiredState`, `PlanStep`, `MemberRole`, `RoleTags`, `OverwriteKey`, `Tombstone`, `DiscordExecuteContext`, `BotConfig`)
- `done` Constants — `constants.ts` (`DISCORD_PERMISSIONS`, permission-name validation and bitfield conversion, `toPascalCase`, `CHANNEL_TYPES`, `PLAN_STATUSES`, `STEP_STATUSES`, `SNAPSHOT_TYPES`)
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
  - `tools/interaction.ts` — ask_user (planning-time interaction; pauses the session for input)
- `done` Assumption evaluator — `tools/evaluate-assumptions.ts` (pre-execution validation: parent exists, no name conflict, bot hierarchy, etc.)
- `done` Zod schemas — `zod-schemas.ts` (shared schema fragments)

### `packages/db/src/`

- `done` Drizzle client — `index.ts` (`db`, `queryClient`)
- `done` Schema tables — `schema.ts`:
  - `users`, `sessions`, `accounts`, `verifications` (Better Auth)
  - `guilds` (`serverType`, `settings`, plan-lock columns)
  - `conversations` (LLM chat audit log, `forkStateHash`, status)
  - `planIterations` (DesiredState snapshots, version, `type`: `llm_generated` | `manual_edit` | `revert`)
  - `plans` (planData JSONB, results, status, rollback tracking)
  - `snapshots` (server-state snapshots for rollback)
  - `rules` (server rules consumed by Stage 2 LLM validation)
  - `templates` (template structure JSONB, per-guild)
  - `driftEvents` (drift detector persistence)
- `done` Relations — all `*Relations` defined

### `apps/web/src/` — Routes

- `done` Login — `routes/Login.tsx` (Better Auth sign-in via Discord)
- `done` Studio — `routes/Studio.tsx` (3-column chat-native layout: history sidebar, chat area, right tabbed preview; SSE consumption; iteration history; live desired-state view; TemplatePanel in-conversation; sole app hub — guild picker handles bot invite)
- `done` Templates list — `routes/Templates.tsx` (`/templates/:guildId`; reachable from the Studio right panel)
- `done` Template editor — `routes/TemplateEditor.tsx` (`/templates/:guildId/:templateId`; editable metadata **and** structure)
- `done` 404 — `routes/NotFound.tsx`
- `done` Route consolidation — `App.tsx`: `/dashboard` + `/dashboard/:guildId` redirect to `/studio`; bare `/templates` redirects to `/studio`. `/setup` route removed entirely.
  - `stashed` Dashboard — `routes/Dashboard.tsx` (file kept on disk, no route; retired in favor of Studio. Rules CRUD moved to the Studio Settings tab)
  - `stashed` Setup — `routes/Setup.tsx` (file kept on disk, no route; guided-setup wizard to be rebuilt later)

### `apps/web/src/` — Components

- `done` AppHeader — `components/AppHeader.tsx`
- `done` AppLayout — `components/AppLayout.tsx`
- `done` EmptyState — `components/EmptyState.tsx`
- `done` DesiredStateView — `components/DesiredStateView.tsx` (structured preview of channels/categories/roles/members/tombstones; used by DesiredTab, inline in the chat, and by the TemplateEditor structure editor; `editing` prop renders inline inputs)
- `stashed` RulesSection — `components/RulesSection.tsx` (former Dashboard CRUD UI for server rules; no longer imported — superseded by the Studio `SettingsTab`. File kept on disk with the stashed Dashboard)
- `done` TemplatePanel — `components/TemplatePanel.tsx` (attach/detach/merge UI in Studio; in-conversation template injection)
- `done` SaveTemplateModal — `components/studio/SaveTemplateModal.tsx` (save a completed plan's desired state as a reusable template; POSTs `structure: desiredState.active`)
- `done` Desired-state primitives — `components/desired-state/` (CategoryItem, CategoryList, ChannelItem, ChannelList, RoleItem, RoleList, MemberItem, MemberList, TombstoneList, DiffBadge, diff utilities; item components support an `editing` mode with inline inputs + add/delete; ChannelList supports an optional onClick for tabbed drill-in)
- `done` API client — `lib/api.ts`
- `done` Auth client — `lib/auth.ts`
- `done` SSE helper — `lib/sse.ts` (parseSseData used by every EventSource consumer)
- `done` Date grouping — `lib/group-conversations.ts` (Today / Yesterday / Earlier bucketing for the history sidebar)

### `apps/web/src/` — Studio (`components/studio/`)

The redesigned Studio is composed of focused components. Routes wire them
together; none of them fetch on their own unless noted.

- `done` StudioShell — 3-column grid (header | sidebar | chat | rightPanel); columns collapse when their slot is empty
- `done` StudioHeader — contextual header (back-to-picker, guild name, Templates / Settings shortcuts)
- `done` ConversationSidebar — collapsible left column; New Chat button, conversation list grouped by date; selection synced from the store
- `done` WelcomeScreen — curated suggestion cards + freeform textarea for the empty state
- `done` ChatArea — message list + docked input. Bubble variants: user prompt, assistant planning (with collapsed log), ask_user, completed (summary + DesiredStateView + inline actions), executing (live step log), executed (rollback / new plan), execute_failed. Revise input is docked at the bottom
- `done` RightPanel — owns the right column; current-state fetch is shared with the channel detail tab; renders the active tab content
- `done` TabPanel — VSCode-style tab bar; persistent vs closable tabs; "+" popover for new closable tabs
- `done` ServerTab — read-only view of the current Discord state; clickable channels open the channel detail tab
- `done` DesiredTab — desired state from the active conversation; diff overlay against the current state
- `done` ChannelDetail — type-conditional settings grid + tags + permission overwrites table
- `done` RolesTab — server-wide role list
- `done` MembersTab — server-wide member role assignments
- `done` TemplatesTab — in-panel template browser: fetches per-guild templates, search filter, channel/role counts, per-template **Merge** (starts a server-side PlanningSession, attaches via `beginPlanning`), and a "Manage →" link to `/templates/:guildId`
- `done` SettingsTab — per-guild server rules CRUD (add/edit/delete), consumed by Stage 2 LLM validation; moved here from the retired Dashboard's RulesSection
- `done` IterationHistoryModal — popout modal with iteration timeline + revert; replaces the inline IterationHistory
- `done` DriftIndicator — top-right toast when the server changes externally; auto-dismisses after 10s; "Re-fork" action

### `apps/web/src/` — Hooks

- `done` `useConversation` — owns the conversation lifecycle (planning SSE, execution SSE, approve/rollback/revise/revert, in-flight guard). Exposes `stale` from the store so the chat can gate Approve; `beginPlanning(convId)` attaches to a server-started PlanningSession (used by template merge)
- `done` `useDesiredStateEdit` — shared desired-state editing hook (begin/cancel/finish edit, patch/add/delete channels·categories·roles, tombstones, symbol generation). Consumed by both Studio (edit conversation state) and TemplateEditor (edit template structure)
- `done` `useGuildState` — `useGuildName(guildId)` hook; resolves a guild id to its display name
- `done` `useGuildDrift` — subscribes to /api/guilds/:guildId/drift/stream, flips a per-guild stale flag, exposes the latest DriftEvent for the toast

### `apps/web/src/` — Stores (Zustand)

- `done` `useAuthStore` — `stores/authStore.ts`
- `done` `useStudioStore` — `stores/studioStore.ts` (tab state, conversation/phase, active templates, per-guild `staleByGuild` flag; dead `panelState`/`showProgress` removed during the redesign)
- `done` `useDashboardStore` — `stores/dashboardStore.ts`

### Tests

22 test files across the monorepo. Highest-value targets per `AGENTS.md` testing strategy:

- `done` `apps/server/src/planning/diff-engine.test.ts` — 3-phase diff algorithm, edge cases
- `done` `apps/server/src/planning/validation.test.ts` — bot hierarchy, member tools, overwrite consolidation, symbol-type matching, bitrate constraint
- `done` `apps/server/src/planning/execution-engine.test.ts` — executePlan member tools, per-step deadline
- `done` `apps/server/src/planning/locking.test.ts` — Drizzle `db` mock
- `done` `apps/server/src/planning/integration.test.ts` — full planning flow
- `done` `apps/server/src/planning/llm-request.test.ts` — HTTP layer
- `done` `apps/server/src/planning/stream-parser.test.ts` — SSE parsing
- `done` `apps/server/src/planning/drift-detector.test.ts` — periodic poll + persistence
- `done` `apps/server/src/planning/planning-session.test.ts` — mocked LLM flow
- `done` `apps/server/src/planning/repair-context.test.ts` — repair-context assembly
- `done` `apps/server/src/bot/formatter.test.ts` — guild cache → LLM text
- `done` `packages/shared/src/state/desired-state-store.test.ts` — CRUD, validation, symbol generation
- `done` `packages/shared/src/state/desired-state-store-member.test.ts` — member-specific CRUD/validation
- `done` `packages/shared/src/state/fork.test.ts` — ServerState → DesiredState
- `done` `packages/shared/src/constants.test.ts` — permission parsing
- `done` `packages/shared/src/tools/channels.test.ts` — channel tool plan/assumptions/execute
- `done` `packages/shared/src/tools/evaluate-assumptions.test.ts` — assumption evaluation
- `done` `packages/shared/src/tools/members.test.ts` — member tool plan/assumptions/execute
- `done` `packages/shared/src/tools/permissions.test.ts` — permission tool plan/assumptions/execute
- `done` `apps/web/src/components/desired-state/diff-utils.test.ts` — diff rendering helpers
- `done` `apps/web/src/stores/studioStore.test.ts` — Zustand store logic
- `done` `apps/web/src/lib/group-conversations.test.ts` — conversation grouping helper
- `gap` `packages/shared/src/hash-server-state.test.ts` — stable stringify + hashing
- `gap` `packages/shared/src/tools/registry.test.ts` — registry invariants
- `gap` `packages/shared/src/tools/categories.ts`, `interaction.ts`, `roles.ts` — no test files yet
- `gap` `packages/shared/src/zod-schemas.test.ts` — schema parse/safeParse
- `gap` `apps/server/src/hono/routes/*.test.ts` — Hono route tests (all 6 route files untested)
- `gap` `apps/web/src/**/*.test.tsx` — no jsdom component-render tests exist; the 3 `done` web tests above cover store/lib logic, not rendered components

## Known Gaps

- `stashed` **Dashboard page** — `routes/Dashboard.tsx` retired (no route, redirects to Studio). File kept on disk for a later rebuild. Plan history has no home in the current UI; rules CRUD moved to the Studio Settings tab.
- `stashed` **Setup page** — `routes/Setup.tsx` retired (no route). Guided server-configuration wizard to be rebuilt later; bot-invite handling now lives in the Studio guild picker.
- `partial` **`shared` package tests** — `packages/shared` covers state, constants, and most tools, but `hash-server-state.ts`, `tools/registry.ts`, `tools/categories.ts`, `tools/interaction.ts`, `tools/roles.ts`, and `zod-schemas.ts` still have no test files.
- `partial` **React component tests** — `apps/web` tests cover Zustand stores and lib helpers (`studioStore`, `group-conversations`, `diff-utils`), but no component has a rendered jsdom test. AGENTS.md marks priority 4. The new studio components are not yet covered.
- `partial` **Hono route tests** — Thin orchestrators, lower priority per AGENTS.md, but still gap.

## Deferred (Phase 2+)

See `docs/issues/open-design-issues.md` for the full log.

- **#11** `planData` JSONB queryability — currently opaque to SQL; `results` array has touched Discord IDs
- **#12** Desired-state re-fork mid-planning — conflict detection at approval time, re-fork during planning is Phase 2
- **#7** System-prompt architecture refinements (template injection already wired, guidance file loading deferred)

## Recently resolved (since May 28, 2026)

- `done` **Template features (full set)** — (1) Save-as-template from a completed plan (`SaveTemplateModal`, stores `desiredState.active`); (2) Merge surfaced in the right-panel `TemplatesTab`, attaching via `useConversation.beginPlanning`; (3) real in-panel template browser replacing the redirect stub; (4) editable template structure in `TemplateEditor` (was read-only) via the shared `useDesiredStateEdit` hook + `DesiredStateView` `editing` mode.
- `done` **Route consolidation** — Studio is the sole hub. `/setup` removed; `/dashboard`, `/dashboard/:guildId`, and bare `/templates` redirect to `/studio`. `Dashboard.tsx` and `Setup.tsx` kept on disk (stashed, unrouted) for a later rebuild. Bot-invite handling moved into the Studio guild picker.
- `done` **Rules management relocated** — server-rules CRUD moved from the Dashboard's `RulesSection` to a Studio right-panel `SettingsTab`. `RulesSection.tsx` stashed with the Dashboard.
- `done` **Design-token unification** — restyled the web app onto the `shell-*`/`agent-*` (+ semantic `success`/`warning`/`error`) token systems; `discord-*` is now reserved for the Discord preview clone (`ServerTab`, `ChannelDetail`) and the stashed Dashboard/Setup/RulesSection. Added the `shell-text-link` token; fixed undefined `shell-yellow`/`shell-red` usages (→ `warning`/`error`).
- `done` **Studio chat-native redesign** — replaced the 1180-line monolithic `Studio.tsx` with a focused 3-column layout (history sidebar, chat area, right tabbed preview). New shell tokens (`shell-*`, `agent-*`) on top of the kept `discord-*` tokens for the preview. Extracted `useConversation` (1180 → 494 lines in `Studio.tsx`, then further reduced). New components under `components/studio/`. `ProcedureSidebar`, `ActionBar`, `ExecutionStatus`, and the inline `IterationHistory` are deleted. Drift lockout + IterationHistoryModal + TabPanel are live.
- `done` **lockPermissions** — full design + 8 files (types, channels, registry, store, fork, execute-context, diff-engine, validation). Per-channel skip for synced channels; `arraysEqualSorted` helper; validation Group D detects identical-overwrite un-synced channels.
- `done` **Member role management** — 2 tools, `memberRoles` in active state, symmetric diffing, Phase 4 enforcement, diff-based rollback via `rollbackFull`, formatter summary.
- `done` **Configuration procedure — dropped entirely** — the `ProcedureSidebar` UI was never shipped (deleted in the chat-native redesign), and the `phaseProgress` JSONB column + its guilds PATCH handler have now been removed too (migration `0010_flashy_salo.sql`). `guidedSetupCompleted` never existed in code. No trace remains in code; design docs describe it as out-of-scope.
- `done` **LLM policy validation (Stage 2)** — `validateWithLLM` calls LLM with rules + plan summary, structured JSON response.
- `done` **Drift detector** — periodic poll, persists `driftEvents`, `/api/guilds/:guildId/drift/stream` SSE, client-side toast + Approve lockout.
- `done` **Rate limiting** — sliding window, 100 req/min, applied to `/api/*`.
- `done` **Env validation** — Zod schema, fail fast at boot.
- `done` **Locks + snapshot cleanup** — periodic background jobs, stale recovery on boot.
- `done` **State routes** — `/api/guilds/:guildId/state|channels|roles|drift/stream` mounted under parent route (no double-guildId bug).
- `done` **Template merge** — LLM-driven merge via `revise`-style flow, reuses `PlanningSession`.
- `done` **Edit state endpoint** — manual edits to desired state via API (`POST /conversations/:id/edit-state`).
- `done` **Template attach/detach** — `POST/DELETE /conversations/:id/templates/:templateId`.
- `done` **Rules CRUD UI** — `SettingsTab` in the Studio right panel; add/edit/delete rules consumed by `validateWithLLM`. (Moved from the retired Dashboard's `RulesSection`, now stashed.)

## Drift between docs and code

- `docs/issues/remaining-fixes.md` lists 5 fixes — **all five are now done** in code, but the doc wasn't updated. This file is the corrected view.
- `docs/issues/remaining-fixes.md` says "Zero test files" — **22 test files exist** (see Tests section above).
- `docs/issues/channel-role-gaps.md` Gap 7 (lockPermissions) status was "IN DESIGN" — **now implemented**, see Recently resolved.
- `AGENTS.md` env vars table (line 236) lists `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` — code uses `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` (see `.env.example`).
- `docs/design/overview.md` mentions `apps/docs/` (Astro SSG) — directory exists but is empty; no Astro app was ever built there.
