# Codebase Map

Current working tree; source-derived. Use headings/route strings to find a feature, then search the
named symbol in its file. `In` = entry; `Core` = main code; `Flow` = call/data trace.

## Whole System

Purpose: Natural-language Discord configuration -> reviewed declarative state -> validated steps ->
Discord mutations.
In: `Studio` (`apps/web/src/routes/Studio.tsx`) -> `useConversation`
(`apps/web/src/hooks/useConversation.ts`) -> conversation/plan routes
(`apps/server/src/hono/routes/conversations.ts`, `apps/server/src/hono/routes/plans.ts`).
Flow: Discord/cache `ServerState` -> `PlanningSession` -> `DesiredStateStore` -> `planIterations` ->
approve to draft `plans` row -> `diffEngine` -> assumptions -> `validatePlan` -> `executePlan` ->
`DiscordExecuteContext` -> Discord -> fresh snapshots/cache/drift/SSE.

## Server Startup

Purpose: Prepare DB/process state, API, bot, and background jobs.
In: `main()` (`apps/server/src/index.ts`).
Core: `getValidatedEnv()` (`apps/server/src/env-validated.ts`); `runMigrations()`
(`apps/server/src/migrate.ts`); `clearStaleLocks()`/`startPeriodicLockCleanup()`
(`apps/server/src/planning/locking.ts`); `recoverInterruptedPlanningSessions()`
(`apps/server/src/planning/session-recovery.ts`); `startSnapshotCleanupJob()`
(`apps/server/src/planning/snapshot-cleanup.ts`); `startDriftDetector()`
(`apps/server/src/planning/drift-detector.ts`); `setupBotEvents()`
(`apps/server/src/bot/index.ts`).
Flow: migrations -> stale lock/session recovery -> cleanup/drift jobs -> Hono `serve()` -> async bot
login; protected API waits on `botReady` before reading cache (`apps/server/src/hono/app.ts`).

## Discord State and Bot Cache

Purpose: Keep the process-local source used for planning/current-state views synchronized with
Discord.
In: `setupBotEvents()` (`apps/server/src/bot/index.ts`); Discord ready/guild/channel/role/member
gateway events.
Core: `rebuildCache()` (`apps/server/src/bot/index.ts`); `guildCache`/`initGuildCache()`
(`apps/server/src/bot/cache.ts`); `formatGuildForLLM()` (`apps/server/src/bot/formatter.ts`);
`botHasAdministrator()` (`apps/server/src/bot/permissions.ts`).
Flow: Discord ready -> `rebuildCache()` -> channels/overwrites/roles in `guildCache` ->
`resolveBotReady()`; later gateway events update cache. `/state`, `/channels`, `/roles`
(`apps/server/src/hono/routes/state.ts`) expose cached state after guild access checks.

## Guild Discovery and Bot Onboarding

Purpose: Show manageable bot-connected guilds and generate the Discord bot invite.
In: `GET /api/guilds`; `GET /api/bot/status`; `GET /api/bot/invite`
(`apps/server/src/hono/routes/guilds.ts`, `apps/server/src/hono/routes/bot.ts`).
Core: `guildCache` (`apps/server/src/bot/cache.ts`); `checkGuildOperable()`
(`apps/server/src/planning/guild-check.ts`); `userHasManageGuild()`
(`apps/server/src/auth/helpers.ts`).
Flow: cached guilds -> bot Administrator/operability check -> user owner/`ManageGuild` check -> guild
list + latest conversation; invite route builds an Administrator OAuth URL from `DISCORD_CLIENT_ID`.

## Conversation Planning

Purpose: Convert a user prompt into versioned `DesiredState` without mutating Discord.
In: authenticated inline `POST /api/guilds/:guildId/conversations` Hono handler
(`apps/server/src/hono/routes/conversations.ts`).
Core: `PlanningSession.start()`/`runLoop()`/`processTurn()`/`dispatchTool()`
(`apps/server/src/planning/planning-session.ts`); `DesiredStateStore`
(`packages/shared/src/state/desired-state-store.ts`); `TOOL_REGISTRY`/`getTool()`
(`packages/shared/src/tools/registry.ts`); `fork()` (`packages/shared/src/state/fork.ts`).
Flow: `buildServerState()` -> `hashServerState()` (`packages/shared/src/hash-server-state.ts`) -> load
guild rules/templates/model -> insert `conversations` -> `new PlanningSession` ->
`DesiredStateStore.fork()` -> LLM tool calls -> each tool's `plan()` mutates desired state ->
`onTurnComplete` inserts `planIterations` and messages -> terminal planning SSE. Persistence occurs
before the `completed` event; conversation-status persistence follows event publication.

## LLM and Prompt Path

Purpose: Build context, call an OpenAI-compatible provider, and assemble streamed tool calls.
In: `PlanningSession.callLLM()` (`apps/server/src/planning/planning-session.ts`).
Core: `SHARED_CORE_PROMPT`/`SERVER_PLANNER_PROMPT`/`TEMPLATE_AUTHORING_PROMPT`
(`apps/server/src/planning/system-prompts.ts`); `formatGuildForLLM()`
(`apps/server/src/bot/formatter.ts`); `getOpenAIFunctionDefinitions()`
(`packages/shared/src/tools/registry.ts`); `prepareMessagesForModel()`
(`apps/server/src/planning/planning-session.ts`); `buildLLMRequest()`
(`apps/server/src/planning/llm-request.ts`); `parseOpenRouterStream()`
(`apps/server/src/planning/stream-parser.ts`).
Flow: system prompt + bounded message history + tool schemas -> `/chat/completions` stream -> parser
accumulates content/reasoning/tool-call fragments -> `processTurn()` -> tool planning or completion.

## Supported Discord Operations

Purpose: Locate each planner/executor capability.
Core: categories create/edit/delete (`packages/shared/src/tools/categories.ts`); channels
create/edit/delete/move (`packages/shared/src/tools/channels.ts`); roles create/edit/delete/move
(`packages/shared/src/tools/roles.ts`); permission overwrite set/remove/batch
(`packages/shared/src/tools/permissions.ts`); member-role add/remove
(`packages/shared/src/tools/members.ts`); planning question (`packages/shared/src/tools/interaction.ts`);
registry/schema/assumptions (`packages/shared/src/tools/registry.ts`).
Flow: each tool's `plan*()` mutates `DesiredStateStore`; `get*Assumptions()` guards execution;
`execute*()` calls `ExecuteContext`. `batch_set_overwrite` and `ask_user` are planning-only;
template authoring excludes member-role tools.

## Planning Controls and Iterations

Purpose: Continue, pause, cancel, revise, manually edit, or restore planning state.
In: authenticated inline handlers under `/api/guilds/:guildId/conversations`: `POST
/:convId/ask-user`, `/:convId/cancel`, `/:convId/revise`, `/:convId/revert/:version`,
`/:convId/edit-state`; `PATCH /:convId/model-config`
(`apps/server/src/hono/routes/conversations.ts`).
Core: `PlanningSession.resume()`/`cancel()`/`revise()`; `DesiredStateStore.revert()`
(`apps/server/src/planning/planning-session.ts`,
`packages/shared/src/state/desired-state-store.ts`); session registry/timeouts
(`apps/server/src/planning/session-manager.ts`).
Flow: ask-user pauses session and starts timeout -> answer adds tool result and resumes; revise adds user
message and reruns; revert/manual edit replaces store and inserts a new `planIterations` version;
cancel aborts provider request and rolls back the in-progress turn.

## Approval

Purpose: Freeze the latest reviewed desired state as an executable contract.
In: authenticated inline `POST /api/guilds/:guildId/conversations/:convId/approve` Hono handler
(`apps/server/src/hono/routes/conversations.ts`).
Core: latest `planIterations.desiredState`; `plans.planData.desiredState`
(`packages/db/src/schema.ts`).
Flow: access/stale/lock/completion checks -> read latest persisted iteration -> insert `plans` row with
`draft` status -> remove in-memory session. Approval does not diff, validate, or execute.

## Diff and Assumptions

Purpose: Convert observed vs desired state into ordered executable steps and block invalid resource
references.
In: execute/replan/rollback handlers (`apps/server/src/hono/routes/plans.ts`).
Core: `diffEngine()` (`apps/server/src/planning/diff-engine.ts`); tool `getAssumptions()` via
`getTool()` (`packages/shared/src/tools/registry.ts`); `evaluateAssumptions()`
(`packages/shared/src/tools/evaluate-assumptions.ts`).
Flow: channel/role/member-role/overwrite/tombstone step generation -> topological sort -> merge edits
and remove no-ops -> symbol table/dangling-symbol resolution -> `PlanStep[]`; conflicts or failed
assumptions return `409` before validation/execution. Execute and replan evaluate assumptions;
explicit rollback checks reverse-diff conflicts only and skips normal assumptions/validation.

## Validation and Guild Rules

Purpose: Block unsafe/invalid plans and enforce current guild policy immediately before execution.
In: execute handler after diff/assumptions (`apps/server/src/hono/routes/plans.ts`).
Core: `validatePlan()` (`apps/server/src/planning/validation.ts`); `loadGuildRuleTexts()`
(`apps/server/src/planning/guild-rules.ts`); rules CRUD
(`apps/server/src/hono/routes/rules.ts`).
Flow: `loadGuildRuleTexts()` supplies planning prompt context; `validatePlan()` independently reloads
current `rules` -> permission/dependency/resource/safety/overwrite/integrity + policy checks -> blockers
fail; configured policy fails closed when unavailable/malformed -> passed plan becomes `validated`.

## Plan Execution

Purpose: Serialize and apply validated plan steps to Discord with progress, abort, retries, and
snapshots.
In: authenticated inline `POST /api/guilds/:guildId/plans/:planId/execute` Hono handler
(`apps/server/src/hono/routes/plans.ts`).
Core: `acquireGuildLock()`/`heartbeatGuildLock()`/`releaseGuildLock()`
(`apps/server/src/planning/locking.ts`); `executePlan()`/`dispatchWithDeadline()`
(`apps/server/src/planning/execution-engine.ts`); `DiscordExecuteContext`
(`apps/server/src/bot/execute-context.ts`) implements `ExecuteContext`
(`packages/shared/src/execute-context.ts`); shared tool `execute()` functions
(`packages/shared/src/tools/`).
Flow: stale hash -> diff -> assumptions -> validation -> lock/heartbeat -> `execution_before` snapshot
-> resolve symbols -> ordered tool execution through Discord context -> execution SSE -> fresh Discord
`execution_after` snapshot -> plan result -> invalidate stale sibling conversations -> unlock.

## Abort and Rollback

Purpose: Stop waiting for active execution and declaratively restore the before-state when possible.
In: `POST /api/guilds/:guildId/plans/:planId/abort`; `POST
/api/guilds/:guildId/plans/:planId/rollback` (`apps/server/src/hono/routes/plans.ts`); step/route
failure.
Core: `executePlan()`/`rollbackFull()`/`buildCurrentStateFromDiscord()`
(`apps/server/src/planning/execution-engine.ts`); `fork()`
(`packages/shared/src/state/fork.ts`); `diffEngine()`
(`apps/server/src/planning/diff-engine.ts`).
Flow: abort controller interrupts engine wait; engine failure/abort with before-snapshot ->
`rollbackFull()` -> fresh Discord state -> fork before-snapshot -> reverse diff -> `executePlan()`.
Explicit rollback independently loads `execution_before`, computes the same reverse diff, locks, then
executes it. `buildCurrentStateFromDiscord()` is a partial channel/role/overwrite projection; rollback
is best-effort and does not fully restore member-role or all channel-property changes.

## Stale Detection and AI Replan

Purpose: Prevent execution against changed Discord state and regenerate a reviewable desired state.
In: stale check in execute; `POST /api/guilds/:guildId/plans/:planId/replan`
(`apps/server/src/hono/routes/plans.ts`).
Core: `hashServerState()` (`packages/shared/src/hash-server-state.ts`); `buildRepairPrompt()`
(`apps/server/src/planning/repair-context.ts`); `PlanningSession`
(`apps/server/src/planning/planning-session.ts`).
Flow: current hash != `conversations.forkStateHash` or diff/assumption conflicts -> `409`; replan forks
fresh state, packages previous desired state + conflicts, retains conversation messages/rules/model,
starts a new planning session, and inserts new iterations. It does not modify the old plan; approval
creates another draft plan.

## Planning and Execution SSE

Purpose: Stream in-process progress to authorized clients.
In: `GET /api/conversations/:id/stream`; `GET /api/plan/:id/stream`
(`apps/server/src/hono/app.ts`).
Core: `emitConversationEvent()`/`subscribeToConversation()`
(`apps/server/src/planning/planning-event-bus.ts`); `emitPlanEvent()`/`subscribeToPlan()`
(`apps/server/src/planning/event-bus.ts`).
Flow: route/session/engine emit -> keyed subscriber bus -> Hono `streamSSE()` ->
`useConversation` (`apps/web/src/hooks/useConversation.ts`). Planning bus retains latest terminal or
ask-user event for late subscribers; execution bus is live-only.

## Drift Detection

Purpose: Report Discord changes outside the declarative execution flow.
In: gateway handlers (`apps/server/src/bot/index.ts`); periodic `startDriftDetector()`
(`apps/server/src/planning/drift-detector.ts`).
Core: `detectDrift()`/`projectGuildForDrift()`/`emitDriftEvent()`/`subscribeToGuildDrift()`
(`apps/server/src/planning/drift-detector.ts`).
Flow: gateway change -> cache update -> unlocked external change emits/persists `driftEvents`;
periodic Discord projection vs `guildCache` catches divergence -> emit + batch persist. `GET
/api/guilds/:guildId/drift/stream` (`apps/server/src/hono/routes/state.ts`) -> `useGuildDrift`
(`apps/web/src/hooks/useGuildDrift.ts`); drift SSE is live-only.

## Templates: Lifecycle and Versions

Purpose: Store creator-owned reusable structures with immutable history.
In: `/api/templates` handlers (`apps/server/src/hono/routes/templates.ts`); `Templates`,
`TemplateViewer`, `TemplateStudio` (`apps/web/src/routes/`).
Core: `createTemplate()`/`forkTemplate()`/`updateTemplateMetadata()`/
`commitTemplateStructure()`/`revertTemplateVersion()`
(`apps/server/src/templates/template-version-service.ts`); `normalizeTemplateStructure()`/
`toTemplateDesiredState()`/`fromTemplateDesiredState()`
(`apps/server/src/templates/template-state.ts`).
Flow: create/fork -> materialized `templates` row + immutable v1 `templateVersions`; manual/AI save
locks row, checks `expectedVersion`, inserts next snapshot, updates materialized structure; revert copies
historical structure into a new version. Version conflict -> `409`.

## Template AI Authoring

Purpose: Modify a template with planning tools only; never execute Discord mutations.
In: `POST /api/templates/:templateId/turns` and turn answer/cancel/stream handlers
(`apps/server/src/hono/routes/templates.ts`); `useTemplateAuthoring`
(`apps/web/src/hooks/useTemplateAuthoring.ts`).
Core: `TemplateSession.start()`/`runLoop()`/`dispatchTool()`
(`apps/server/src/planning/template-session.ts`); `TEMPLATE_TOOL_NAMES`
(`packages/shared/src/tools/registry.ts`); template session registry/event bus
(`apps/server/src/planning/template-session-manager.ts`,
`apps/server/src/planning/template-event-bus.ts`).
Flow: persisted authoring turn + current template -> `toTemplateDesiredState()` -> template-only tool
schemas -> each `plan()` mutates `DesiredStateStore` -> ask/resume/cancel or AI version commit -> persist
turn -> template SSE. Cancel/pre-commit failure restores in-memory pre-turn state; a committed template
version is not undone if later turn persistence fails. Terminal events support late replay and DB
fallback.

## Template Context in Server Planning

Purpose: Supply reusable structures as planner context, not direct server mutations.
In: conversation create `templateIds`; `POST
/api/guilds/:guildId/conversations/:convId/templates`; `DELETE
/api/guilds/:guildId/conversations/:convId/templates/:templateId`
(`apps/server/src/hono/routes/conversations.ts`).
Core: `PlanningSession.addTemplate()`/`removeTemplate()`/`rebuildSystemPrompt()`
(`apps/server/src/planning/planning-session.ts`).
Flow: verify creator ownership -> attach full template metadata/structure -> rebuild prompt's
`<attached_templates>` section -> normal LLM tool planning decides desired-state changes.

## Model and Reasoning Configuration

Purpose: Restrict planning to one/two deployment models and validate per-turn reasoning options.
In: `GET|PUT /api/settings/models` (`apps/server/src/hono/routes/settings.ts`); conversation
create/model-config routes; template authoring turn route; `SettingsDialog`/`ModelSelector`
(`apps/web/src/components/studio/`).
Core: `getOpenRouterModels()` (`apps/server/src/planning/openrouter-models.ts`);
`resolveConfiguredModels()`/`validateModelSelection()`
(`apps/server/src/planning/model-config.ts`); `resolveDeploymentModelConfig()`
(`apps/server/src/planning/deployment-model-config.ts`).
Flow: tool-capable OpenRouter catalog -> save IDs in `appSettings[openrouter_models]` -> selection must
belong to allowlist before optional catalog enrichment -> persist conversation model/reasoning or pass
turn model to `TemplateSession` -> `buildLLMRequest()`. Catalog metadata is cached/best-effort;
persisted IDs remain usable during catalog failure. Conversations always resolve deployment config;
template turns validate a supplied config but otherwise fall back to `LLM_MODEL`.

## Authentication and Guild Access

Purpose: Authenticate Discord users and require control of the target guild.
In: Better Auth `/api/auth/*` (`apps/server/src/hono/app.ts`); Discord provider config
(`apps/server/src/auth/config.ts`).
Core: `authMiddleware()`/`requireUser()` (`apps/server/src/auth/middleware.ts`);
`userHasManageGuild()` (`apps/server/src/auth/helpers.ts`); `checkGuildOperable()`
(`apps/server/src/planning/guild-check.ts`).
Flow: Better Auth session -> Hono user context -> bot-ready/operable guild -> Discord owner or
`ManageGuild` check -> route. Discord authorization outage maps to `503`.

## API Composition

Purpose: Mount public auth/health and protected bot-backed APIs.
In/Core: Hono `app` (`apps/server/src/hono/app.ts`).
Core: `rateLimit()` (`apps/server/src/hono/middleware/rate-limit.ts`); global `app.onError()` and route
mounts (`apps/server/src/hono/app.ts`).
Flow: CORS -> rate limit -> public auth/health; protected `/api` -> `botReady` -> `authMiddleware` ->
guild/state/rules/plans/conversations/templates, SSE, bot, and settings route apps. Most route callbacks
are inline; search the full literal route suffix in the named route file.

## Persistence Map

Core: Drizzle schema (`packages/db/src/schema.ts`); `db`/`queryClient`
(`packages/db/src/index.ts`).
Flow: auth -> `users`, `sessions`, `accounts`, `verifications`; guild config/locks -> `guilds`,
`rules`, `appSettings`; planning -> `conversations`, `planIterations`, `plans`; execution/rollback ->
`snapshots`; templates -> `templates`, `templateVersions`, `templateAuthoringTurns`; drift ->
`driftEvents`.

## Shared Domain Contracts

Core: `ServerState`, `DesiredState`, `PlanStep`, symbols, assumptions, snapshots, events
(`packages/shared/src/types.ts`); `DesiredStateStore`
(`packages/shared/src/state/desired-state-store.ts`); `ExecuteContext`
(`packages/shared/src/execute-context.ts`); permissions/channel/status constants
(`packages/shared/src/constants.ts`); tools (`packages/shared/src/tools/`).
Flow: `ServerState` is observed Discord state; `DesiredState` is mutable declarative intent;
`diffEngine()` produces `PlanStep[]`; tool `plan()` changes desired state; tool `execute()` changes
Discord only through `ExecuteContext`.

## Frontend Entry Index

Routes: canonical table (`apps/web/src/App.tsx`); server planning `Studio`
(`apps/web/src/routes/Studio.tsx`); template list/view/authoring `Templates`/`TemplateViewer`/
`TemplateStudio` (`apps/web/src/routes/`).
Transport/state: `useConversation` (`apps/web/src/hooks/useConversation.ts`);
`useTemplateAuthoring` (`apps/web/src/hooks/useTemplateAuthoring.ts`); `useGuildDrift`
(`apps/web/src/hooks/useGuildDrift.ts`); API/SSE helpers (`apps/web/src/lib/api.ts`,
`apps/web/src/lib/sse.ts`); `useStudioStore` (`apps/web/src/stores/studioStore.ts`).
