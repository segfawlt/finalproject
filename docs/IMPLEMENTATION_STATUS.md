# Implementation Status

Last updated: 2026-08-13

Source of truth for what is actually built in this codebase. When a design doc,
issue doc, or comment disagrees with code, this file wins. Update after major
features land.

Legend: `done` (implemented & wired) · `partial` (code present, incomplete wiring) · `placeholder` (UI says "coming soon") · `gap` (no code at all)

## Subsystems

### `apps/server/src/bot/`

- `done` Guild cache + lifecycle — `bot/index.ts` (init; sync on channel/role/member events; persist and stream externally observed channel, role, and member-role drift; suppress expected gateway events while an execution lock is held)
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
  - `done` `/api/guilds/:guildId/conversations` — `routes/conversations.ts` (list, get, create, next-turn model/reasoning configuration, ask-user, cancel, approve, revise, revert, edit-state, template-attach/detach)
  - `done` `/api/templates` — `routes/templates.ts` (creator-scoped global create, metadata, delete, fork, immutable version history, manual save, revert, and planning-only authoring turns/SSE; guild path is a creator-filtered read compatibility alias; merge returns 410)
  - `done` `/api/bot` — `routes/bot.ts` (status, OAuth invite URL)

### `apps/server/src/planning/`

- `done` Diff engine — `planning/diff-engine.ts` (3-phase: raw steps → topo sort → optimize; supported channel property diffing; lockPermissions skip for synced channels; `arraysEqualSorted` helper; member role symmetric diffing; overwrite symmetric diffing)
- `done` Drift detector — `planning/drift-detector.ts` (periodic poll, compares real Discord state vs cache, persists `driftEvents`)
- `done` Event bus — `planning/event-bus.ts` (pub/sub for execution events per plan)
- `done` Planning event bus — `planning/planning-event-bus.ts` (pub/sub per conversation with bounded replay of the latest terminal event for late SSE subscribers)
- `done` Template authoring session — `planning/template-session.ts`, `template-session-manager.ts`, and `template-event-bus.ts` (creator-scoped planning-only DesiredState mutation, ask-user pause/resume, cancellation rollback, provider failure handling, and bounded terminal replay)
- `done` Execution engine — `planning/execution-engine.ts` (resolveSymbols, isTransientError/isKnownError, exponential backoff with jitter, hardcoded `diagnoseError`, diff-based `rollbackFull` for rollback (recomputes reverse diff from live state vs before-snapshot), tracked completed-step Discord IDs, per-step deadline via `dispatchWithDeadline` — `StepTimeoutError` terminal because an uncancellable Discord mutation may have completed remotely / `StepAbortedError` terminal, abort-aware so plan-level timeout interrupts mid-step)
- `done` Guild access check — `planning/guild-check.ts` (admin + bot-in-guild check)
- `done` Guild-rule loader — `planning/guild-rules.ts` (loads authorised guild policy text for initial and stale-repair planning prompts)
- `done` LLM HTTP — `planning/llm-request.ts` (raw POST to OpenRouter-compatible endpoint, configurable via `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`; per-turn model reasoning request options)
- `done` Deployment model config — `planning/model-config.ts`, `planning/deployment-model-config.ts`, `planning/openrouter-models.ts` (two-model persisted allowlist, OpenRouter tool-model catalog cache and reasoning metadata; allowlist enforced before optional catalog enrichment)
- `done` Stream parser — `planning/stream-parser.ts` (SSE chunk parsing, complete-response buffering, tool-call delta accumulation, reasoning-detail preservation, thought/answer separation)
- `done` Locking — `planning/locking.ts` (per-guild execution locks, stale-lock recovery at boot, periodic cleanup)
- `done` Planning session — `planning/planning-session.ts`, `planning/system-prompts.ts`, and `src/prompts/*.md` (LLM loop; startup-loaded shared/server/template Markdown guidance; delimited server, guild-rule, template, and template-state data; full creator-owned template JSON baselines; 4-phase model + permission strategy; retained context during prompt rebuilds; persistence-before-completion ordering; `ask_user` pause/resume; message windowing; `callLLM`)
- `done` Session manager — `planning/session-manager.ts` (in-memory `PlanningSession` registry + ask_user timeouts)
- `done` Restart recovery — `planning/session-recovery.ts` (marks orphaned planning/waiting rows as interrupted errors; completed persisted iterations remain approvable)
- `done` Snapshot cleanup — `planning/snapshot-cleanup.ts` (background job, removes orphaned `plan_iterations`)
- `done` Validation — `planning/validation.ts` (Groups A–E: perm-name validity, ADMINISTRATOR + strict bot role-hierarchy including equal-position targets, symbol resolution + **symbol-type matching**, DAG/cycle, duplicate names, member-role dedupe, category child cap, topic/**bitrate** channel-type constraints, ADMINISTRATOR-grant block, overwrite-consolidation warning; Stage 2 LLM policy check against `rules` table via `validateWithLLM`; guilds with configured rules **fail closed** on missing key, rule-load failure, provider error/timeout, or empty/malformed output)
  - `done` **Server rules guide planning and are revalidated at execution.** Initial conversations and stale-plan repair load authorised guild rules into retained prompt context. Stage 2 reloads current rules and remains the fail-closed execution boundary.
  - `done` **Confirmed AI re-plan for stale plans.** `POST /plans/:planId/replan` re-forks from current Discord state and starts a fresh `PlanningSession` with persisted conversation context, prior desired state, and structured conflicts. Studio offers it only after a stale execution conflict; repaired plans always return to review before execution.
  - `note` Deliberately **not** validated (documented in the design doc): per-action bot perms (redundant with ADMINISTRATOR), role-position ordering among movable roles, IMPORTANT-channel / delete-all-from-category guards (conflict with "present, don't judge"), bot-own-permission lockout (impossible under ADMINISTRATOR), planData Zod check (internal deterministic data).

### `apps/server/src/`

- `done` Process entry — `index.ts` (awaited migration/recovery sequence before Hono binding, bot login, background jobs, drift detector lifecycle, shutdown cleanup)
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
- `done` Tool registry — `tools/registry.ts` (17 tools: 4 category, 4 channel, 4 role, 3 permission, 2 member, 1 interaction; `getTool`, filtered or unfiltered `getOpenAIFunctionDefinitions`, and `TEMPLATE_TOOL_NAMES`)
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
  - `templates` (creator-owned global template metadata and current materialized structure JSONB)
  - `templateVersions` (immutable structural snapshots with source and optional authoring turn)
  - `templateAuthoringTurns` (creator-scoped natural-language prompt/message audit and terminal status)
  - `driftEvents` (drift detector persistence)
- `done` Relations — all `*Relations` defined

### `apps/web/src/` — Routes

- `done` Login — `routes/Login.tsx` (Better Auth sign-in via Discord)
- `done` Studio — `routes/Studio.tsx` (standalone dark server selector at `/studio`; full 3-column chat-native layout at `/studio/:guildId`; persistent workspace sidebar, shared fresh/revise composer with time-based fresh greeting, right tabbed preview; SSE consumption; iteration history; live desired-state view; TemplatePanel in-conversation; guild picker handles bot invite, refresh, authenticated-user label, localized last-conversation time, and animated accessible server selection rows)
- `done` Templates library/viewer — `routes/Templates.tsx` (`/templates`) plus `routes/TemplateViewer.tsx` (`/templates/:templateId`; template-mode navigation without conversation history, creator-owned browsing, responsive metadata cards, blank creation, fork/delete lifecycle, canonical navigation, description, and read-only structure view)
- `done` Template Studio — `routes/TemplateStudio.tsx`, `hooks/useTemplateAuthoring.ts`, and `components/template-studio/` (`/templates/:templateId/studio`; template-mode navigation without conversation history, Studio-style authoring turns and docked composer, creator-scoped AI authoring SSE, immutable version history/revert, historical read-only preview, and explicit manual structure versions; no Discord execution)
- `done` 404 — `routes/NotFound.tsx`
- `done` Canonical route table — `App.tsx`: `/studio`, `/studio/:guildId`, `/templates`, `/templates/:templateId`, and `/templates/:templateId/studio`; legacy dashboard/setup and non-canonical template URLs redirect to their canonical destinations.
  - `stashed` Dashboard — `routes/Dashboard.tsx` (file kept on disk, no route; retired in favor of Studio. Rules CRUD moved to the Studio SettingsDialog)
  - `stashed` Setup — `routes/Setup.tsx` (file kept on disk, no route; guided-setup wizard to be rebuilt later)

### `apps/web/src/` — Components

- `stashed` AppHeader — `components/AppHeader.tsx` (retained on disk; product navigation and account actions are rendered by WorkspaceSidebar)
- `done` AppLayout — `components/AppLayout.tsx` (route outlet wrapper without a duplicate global header)
- `done` EmptyState — `components/EmptyState.tsx`
- `done` DesiredStateView — `components/DesiredStateView.tsx` (structured preview of channels/categories/roles/members/tombstones; used by DesiredTab, inline in the chat, and by Template Studio preview; `editing` prop renders inline inputs)
- `stashed` RulesSection — `components/RulesSection.tsx` (former Dashboard CRUD UI for server rules; no longer imported — superseded by the Studio `SettingsDialog`, which wraps `SettingsTab`. File kept on disk with the stashed Dashboard)
- `done` TemplatePanel — `components/TemplatePanel.tsx` (attach/detach context UI in Studio; in-conversation template injection with redesigned context card, tabs, search, and template rows)
- `done` SaveTemplateModal — `components/studio/SaveTemplateModal.tsx` (save a completed plan's desired state as a global reusable template; POSTs `structure: desiredState.active`)
- `done` Desired-state primitives — `components/desired-state/` (CategoryItem, CategoryList, ChannelItem, ChannelList, RoleItem, RoleList, MemberItem, MemberList, TombstoneList, DiffBadge, diff utilities; item components support an `editing` mode with inline inputs + add/delete; ChannelList supports an optional onClick for tabbed drill-in)
- `done` API client — `lib/api.ts`
- `done` Auth client — `lib/auth.ts`
- `done` SSE helper — `lib/sse.ts` (parseSseData used by every EventSource consumer)
- `done` Date grouping — `lib/group-conversations.ts` (Today / Yesterday / Earlier bucketing for the history sidebar)

### `apps/web/src/` — Studio (`components/studio/`)

The redesigned Studio is composed of focused components. Routes wire them
together; none of them fetch on their own unless noted.

- `done` StudioShell — 3-column grid (header | sidebar | chat | rightPanel) with independently persisted, clamped resizable panels, keyboard/pointer resizing, reset, and mobile overlays
- `done` StudioHeader — contextual header (back-to-picker, guild name, History, and Settings shortcut)
- `done` WorkspaceSidebar — shared Studio navigation, persistent active server identity, account/sign-out actions, New Chat, and conversation list grouped by date; template mode suppresses conversation fetches and history rendering
- `done` WelcomeScreen — curated suggestion cards + freeform textarea for the empty state; presentation-focused monochrome spacing and hierarchy
- `done` ChatArea — message list + floating revision composer with reserved bottom space and blur/fade treatment. The composer uses the local `components/ui/border-beam.tsx` white traveling beam while planning or waiting for user input. Bubble variants: user prompt, assistant planning (with collapsed log + Cancel), ask_user, completed (summary + DesiredStateView + inline actions), executing (live step log + Abort), executed (rollback / new plan), execute_failed. Message viewport owns vertical scrolling
- `done` RightPanel — owns the right column; current-state fetch is shared with the channel detail tab; renders the active tab content
- `done` TabPanel — rounded sentence-case tab bar; persistent vs closable tabs; "+" popover for new closable tabs
- `done` ServerTab — read-only view of the current Discord state; clickable channels open the channel detail tab
- `done` DesiredTab — desired state from the active conversation; diff overlay against the current state
- `done` ChannelDetail — type-conditional settings grid + tags + permission overwrites table
- `done` RolesTab — server-wide role list
- `done` MembersTab — server-wide member role assignments
- `done` TemplatesTab — in-panel template browser: fetches creator-owned templates through the guild compatibility read, search filter, channel/role counts, per-template **Use**/**Stop using** context actions, and canonical viewer links
- `done` SettingsDialog — keyboard-modal Studio settings for per-guild server rules CRUD and deployment-wide OpenRouter two-model selection; wraps the rules-focused `SettingsTab` and replaces the former right-panel Settings tab
- `done` ModelSelector — chat model/reasoning controls, supported-level discovery, next-turn configuration persistence
- `done` IterationHistoryModal — popout modal with iteration timeline + revert; replaces the inline IterationHistory
- `done` DriftIndicator — top-right toast when the server changes externally; auto-dismisses after 10s; "Re-fork" action

### `apps/web/src/` — Hooks

- `done` `useConversation` — owns the conversation lifecycle (planning SSE, execution SSE, approve/rollback/revise/revert, in-flight guard). Exposes `stale` from the store so the chat can gate Approve; fresh-chat template selections remain local and are sent with the next create-conversation request, while `beginPlanning(convId)` attaches only to a server-started PlanningSession for AI stale-plan repair
- `done` `useDesiredStateEdit` — shared desired-state editing hook (begin/cancel/finish edit, patch/add/delete channels·categories·roles, tombstones, symbol generation). Consumed by both Server Studio and Template Studio preview
- `done` `useGuildState` — `useGuildName(guildId)` hook; resolves a guild id to its display name
- `done` `useGuildDrift` — subscribes to /api/guilds/:guildId/drift/stream, flips a per-guild stale flag, exposes the latest DriftEvent for the toast
- `done` `useStudioShellLayout` — persisted panel widths/visibility with clamping, reset, and guarded storage access
- `done` `useTemplateAuthoring` — `hooks/useTemplateAuthoring.ts` (natural-language authoring requests, SSE events, ask-user, cancellation, and refresh after persisted completion)

### `apps/web/src/` — Stores (Zustand)

- `done` `useAuthStore` — `stores/authStore.ts`
- `done` `useStudioStore` — `stores/studioStore.ts` (tab state, conversation/phase, active templates, persisted active guild, per-guild `staleByGuild` flag; dead `panelState`/`showProgress` removed during the redesign)
- `done` `useDashboardStore` — `stores/dashboardStore.ts`

### `apps/web/src/` — Template Studio Components

- `done` `components/template-studio/TemplateVersionHistory.tsx` — newest-first immutable version selection and revert
- `done` `components/template-studio/TemplatePreview.tsx` — category/channel and role preview with explicit local draft editing and save

### OpenCode workflow

- `done` Plan-driven subagent orchestration — `opencode.json`,
  `.opencode/prompts/executor-guideline.md`, and
  `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md` (primary agent retains
  plan decomposition, review, integration, and final verification; read-only `explore`; scoped
  Luna `executor` supports bounded implementation and validation assignments)

### Documentation

- `done` Project presentation — `docs/presentation/index.html` is a standalone 15-slide
  technical/academic project presentation focused on plan-first architecture, followed by
  a live-demo handoff; `docs/presentation/transcript.md` provides the matched delivery
  script.
- `done` Source-derived backend feature and call-flow index — `docs/CODEBASE_MAP.md`
  (compact AI-oriented symbol/path map of the current working tree; code remains authoritative)

### Tests

49 Vitest files across the monorepo. Highest-value targets per `AGENTS.md` testing strategy:

- `done` `apps/server/src/planning/diff-engine.test.ts` — 3-phase diff algorithm, edge cases
- `done` `apps/server/src/planning/validation.test.ts` — bot hierarchy, member tools, overwrite consolidation, symbol-type matching, bitrate constraint
- `done` `apps/server/src/planning/policy-validation.test.ts` — fail-closed rule loading/configuration/provider/response behavior, valid blockers and warnings, 30-second request bound
- `done` `apps/server/src/planning/execution-engine.test.ts` — executePlan member tools, per-step deadline
- `done` `apps/server/src/planning/locking.test.ts` — Drizzle `db` mock
- `done` `apps/server/src/planning/integration.test.ts` — full planning flow
- `done` `apps/server/src/planning/llm-request.test.ts` — HTTP layer
- `done` `apps/server/src/planning/stream-parser.test.ts` — SSE parsing
- `done` `apps/server/src/planning/drift-detector.test.ts` — periodic poll + persistence
- `done` `apps/server/src/planning/planning-session.test.ts` — mocked LLM flow
- `done` `apps/server/src/planning/planning-event-bus.test.ts` — late terminal-event replay and stale replay clearing
- `done` `apps/server/src/planning/template-session.test.ts` and `template-event-bus.test.ts` — isolated template planning lifecycle and terminal replay
- `done` `apps/server/src/templates/template-version-service.test.ts` — creator ownership, atomic version writes, manual/AI/revert commits, unchanged structures, and conflict handling
- `done` `apps/server/src/planning/repair-context.test.ts` — repair-context assembly
- `done` `apps/server/src/planning/rollback-reporting.test.ts` — rollback success/failure event emission (conflict-blocked and step-failure paths)
- `done` `apps/server/src/hono/routes/templates.test.ts` — creator ownership, global lifecycle routes, authoring transport, version access, and retired merge response
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
- `done` `apps/web/src/hooks/useStudioShellLayout.test.ts` — panel persistence and width clamping
- `done` `apps/web/src/hooks/useConversation.test.ts` — historical chat hydration and failed-selection state reset
- `done` `apps/web/src/hooks/useTemplateAuthoring.test.ts` — authoring SSE lifecycle, ask-user, cancellation, and terminal refresh
- `done` `apps/web/src/components/studio/WorkspaceSidebar.test.tsx` — persistent navigation, New chat, recent conversations, and account footer
- `done` `apps/web/src/components/studio/StudioShell.test.tsx` — independent panel visibility and shell interactions
- `done` `apps/web/src/components/studio/TemplatesTab.test.tsx` — pending fresh-chat Use/Stop using context actions, active-conversation attachment, and canonical viewer links
- `done` `apps/web/src/components/TemplatePanel.test.tsx` — in-conversation template context actions
- `done` `apps/web/src/components/template-studio/TemplateVersionHistory.test.tsx` and `TemplatePreview.test.tsx` — version selection/revert and explicit draft editing
- `done` `apps/web/src/routes/Templates.test.tsx` and `TemplateViewer.test.tsx` — global library/viewer lifecycle and canonical navigation
- `done` `apps/web/src/routes/TemplateStudio.test.tsx` — template-mode authoring composition and dirty-draft navigation guard
- `gap` `packages/shared/src/hash-server-state.test.ts` — stable stringify + hashing
- `done` `packages/shared/src/tools/registry.test.ts` — registry invariants and template allowlist filtering
- `gap` `packages/shared/src/tools/categories.ts`, `interaction.ts`, `roles.ts` — no test files yet
- `gap` `packages/shared/src/zod-schemas.test.ts` — schema parse/safeParse
- `partial` `apps/server/src/hono/routes/*.test.ts` — Hono route tests (`templates.test.ts` covers read authorization; the other 5 route files remain untested)
- `done` `apps/web/src/**/*.test.tsx` — focused jsdom coverage exists for the shared shell, workspace sidebar, template context, Template Studio preview/history, and global library/viewer

## Known Gaps

- `stashed` **Dashboard page** — `routes/Dashboard.tsx` retired (no route, redirects to Studio). File kept on disk for a later rebuild. Plan history has no home in the current UI; rules CRUD moved to the Studio SettingsDialog.
- `stashed` **Setup page** — `routes/Setup.tsx` retired (no route). Guided server-configuration wizard to be rebuilt later; bot-invite handling now lives in the Studio guild picker.
- `partial` **`shared` package tests** — `packages/shared` covers state, constants, most tools, and the tool registry, but `hash-server-state.ts`, `tools/categories.ts`, `tools/interaction.ts`, `tools/roles.ts`, and `zod-schemas.ts` still have no test files.
- `partial` **React component tests** — `apps/web` has focused rendered jsdom coverage for the shared shell, workspace sidebar, template context, Template Studio preview/history, and global library/viewer, but most components remain untested.
- `partial` **Hono route tests** — Thin orchestrators, lower priority per AGENTS.md. `templates.ts` now has read-authorization tests; the other 5 route files remain untested.

## Deferred (Phase 2+)

See `docs/issues/open-design-issues.md` for the full log.

- **#11** `planData` JSONB queryability — currently opaque to SQL; `results` array has touched Discord IDs
- **#12** Desired-state re-fork mid-planning — conflict detection at approval time, re-fork during planning is Phase 2
- Intent-matched planning guidance selection; static shared and mode-specific Markdown prompts are implemented.

## Recently resolved (since May 28, 2026)

- `done` **System-prompt architecture** — Server planning and Template Studio now compose a small shared core with separate Markdown mode instructions loaded once at startup. Dynamic server state, guild rules, template state, and full authoritative creator-owned template structures are delimited as data; prompt assets are copied into the server build.

- `done` **Section 5.8 implementation-review batch** — bounded terminal planning-event replay closes the late-SSE race; planning completion now follows durable iteration persistence; prompt rebuilds retain fork, template, and guild-rule context; failed after-snapshot reads no longer fabricate empty Discord state; persisted completed conversations remain approvable after restart while in-flight rows are marked interrupted; Studio exposes phase-correct Cancel/Abort/Settings actions; gateway drift for channels, roles, and member-role changes is persisted and suppressed during execution locks; migrations and recovery finish before traffic and background jobs start. Covered by `planning-event-bus.test.ts`, expanded `planning-session.test.ts`, `plans.test.ts`, full typecheck, and 208 passing Vitest cases across 27 files.
- `done` **Rollback failure reporting** — `rollbackFull` and the step-failure/conflict-blocked paths in `execution-engine.ts` now emit a distinct `rollback_failed` event (added to the `ExecutionEvent` union) instead of silently reporting `plan_failed`. The web client (`useConversation.ts` SSE listener + `ChatArea.tsx` render branch and step badge) surfaces the failed-rollback state to the user. Covered by `rollback-reporting.test.ts`.
- `done` **Historical conversation hydration** — Studio restores a selected conversation's saved prompt, final assistant response, and latest desired-state iteration rather than rendering an empty completed chat. Failed history selections clear the prior conversation view and show the request error. Covered by `useConversation.test.ts`.
- `done` **Global creator-only template lifecycle** — global library/viewer and dedicated Template Studio use canonical routes; blank creation, save-as-template, metadata editing, fork, delete, immutable manual/AI/revert versions, planning-only natural-language authoring, and persisted authoring turns are wired. Server Studio retains `Use`/`Stop using` context actions and exposes no Merge action. Covered by template route, service, session, and web tests.
- `done` **Template UI refinement** — template routes now share Studio navigation without conversation history; library cards show responsive structure metadata and update dates; viewer exposes descriptions; Template Studio presents authoring as chat-style turns with a docked composer while retaining save/discard/stay draft protection.
- `done` **Post-planning session survival** — the SSE merge handler no longer removes the planning session on `completed`, so the approve/execute path can still retrieve a `completed` session (matches `POST /conversations`).
- `done` **Fail-closed guild-rule enforcement** — Stage 2 now loads rules before deciding whether an LLM call is needed. Guilds without rules skip the call; guilds with rules block execution when rules cannot be loaded, no LLM key is configured, the provider fails or exceeds 30 seconds, or the response is empty/malformed. Valid policy blockers and warnings retain their severities.
- `done` **Template read authorization** — creator-owned global list/detail/version/authoring routes filter by authenticated user; unknown and non-owned resources return 404. Guild-scoped reads remain a creator-filtered compatibility alias. Covered by `templates.test.ts`.
- `done` **Route consolidation** — Studio is the sole hub. `/setup` removed; `/dashboard` and `/dashboard/:guildId` redirect to `/studio`, while canonical global template routes are `/templates`, `/templates/:templateId`, and `/templates/:templateId/studio`. `Dashboard.tsx` and `Setup.tsx` remain stashed and unrouted. Bot-invite handling moved into the Studio guild picker.
- `done` **Rules management relocated** — server-rules CRUD moved from the Dashboard's `RulesSection` to the Studio `SettingsDialog`, which wraps `SettingsTab`. `RulesSection.tsx` stashed with the Dashboard.
- `done` **Design-token unification** — restyled the web app onto the `shell-*`/`agent-*` (+ semantic `success`/`warning`/`error`) token systems; `discord-*` is now reserved for the Discord preview clone (`ServerTab`, `ChannelDetail`) and the stashed Dashboard/Setup/RulesSection. Added the `shell-text-link` token; fixed undefined `shell-yellow`/`shell-red` usages (→ `warning`/`error`).
- `done` **Studio chat-native redesign** — replaced the 1180-line monolithic `Studio.tsx` with a focused 3-column layout (history sidebar, chat area, right tabbed preview). New shell tokens (`shell-*`, `agent-*`) on top of the kept `discord-*` tokens for the preview. Extracted `useConversation` (1180 → 494 lines in `Studio.tsx`, then further reduced). New components under `components/studio/`. `ProcedureSidebar`, `ActionBar`, `ExecutionStatus`, and the inline `IterationHistory` are deleted. Drift lockout + IterationHistoryModal + TabPanel are live.
- `done` **lockPermissions** — full design + 8 files (types, channels, registry, store, fork, execute-context, diff-engine, validation). Per-channel skip for synced channels; `arraysEqualSorted` helper; validation Group D detects identical-overwrite un-synced channels.
- `done` **Member role management** — 2 tools, `memberRoles` in active state, symmetric diffing, Phase 4 enforcement, diff-based rollback via `rollbackFull`, formatter summary.
- `done` **Configuration procedure — dropped entirely** — the `ProcedureSidebar` UI was never shipped (deleted in the chat-native redesign), and the `phaseProgress` JSONB column + its guilds PATCH handler have now been removed too (migration `0010_flashy_salo.sql`). `guidedSetupCompleted` never existed in code. No trace remains in code; design docs describe it as out-of-scope.
- `done` **LLM policy validation (Stage 2)** — `validateWithLLM` calls LLM with rules + plan summary, structured JSON response.
- `done` **Conversation model configuration for create/update and policy validation** — conversations persist an allowlisted model and optional reasoning selection; `PATCH /conversations/:convId/model-config` changes it only for the next planning turn; Stage 2 policy validation uses the linked conversation configuration.
- `done` **OpenRouter model hot-swapping** — authenticated Settings dialog searches the cached tool-capable OpenRouter catalog and saves one or two deployment-wide models. The chat selector applies the persisted model/reasoning setting at each new planning request and policy validation. Complete LLM responses are buffered before tools run; compatible structured reasoning remains server-only and is retained only when the selected model stays the same.
- `done` **Drift detector** — periodic poll, persists `driftEvents`, `/api/guilds/:guildId/drift/stream` SSE, client-side toast + Approve lockout.
- `done` **Rate limiting** — sliding window, 100 req/min, applied to `/api/*`.
- `done` **Env validation** — Zod schema, fail fast at boot.
- `done` **Locks + snapshot cleanup** — periodic background jobs, stale recovery on boot.
- `done` **State routes** — `/api/guilds/:guildId/state|channels|roles|drift/stream` mounted under parent route (no double-guildId bug).
- `done` **Template context actions** — Server Studio attaches and detaches templates through `Use`/`Stop using`; no UI merge action or merge planning session remains.
- `done` **Edit state endpoint** — manual edits to desired state via API (`POST /conversations/:id/edit-state`).
- `done` **Template attach/detach** — `POST/DELETE /conversations/:id/templates/:templateId`.
- `done` **Rules CRUD UI** — `SettingsDialog` overlays Studio; add/edit/delete rules consumed by `validateWithLLM`, alongside deployment model configuration.

## Drift between docs and code

- `docs/issues/remaining-fixes.md` lists 5 fixes — **all five are now done** in code, but the doc wasn't updated. This file is the corrected view.
- `docs/issues/remaining-fixes.md` says "Zero test files" — **26 test files exist** (see Tests section above).
- `docs/issues/channel-role-gaps.md` Gap 7 (lockPermissions) status was "IN DESIGN" — **now implemented**, see Recently resolved.
- `AGENTS.md` env vars table (line 236) lists `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` — code uses `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` (see `.env.example`).
- `docs/design/overview.md` mentions `apps/docs/` (Astro SSG) — directory exists but is empty; no Astro app was ever built there.
