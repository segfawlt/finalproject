# How the Discord Platform Works — End to End

This document explains what happens from the moment an administrator types a
request in plain English to the moment channels, roles, and permission
overwrites actually appear (or disappear) inside a Discord server. It is
written for someone reading the codebase for the first time and assumes no
prior knowledge of Discord, the LLM stack, or this specific system.

**A two-sentence primer on Discord** (for orientation): Discord is a chat
platform. People join "servers" (called **guilds** in Discord's API). Each
guild has **channels** (text or voice rooms) and **roles** (named groups of
members with shared permissions). A **permission overwrite** attaches a role's
allow/deny rules to a specific channel. Everything this system does
eventually becomes a change to one of those four things: channels, roles,
permission overwrites, or which members hold which roles.

---

## The 30-second version

An administrator describes a Discord server setup in plain English. An AI
planner turns that description into a structured "desired state". A diff engine
compares the desired state to what Discord currently has and produces an
ordered list of steps. A validator checks the steps for safety. A human
approves. An execution engine runs each step against the live Discord server
via a bot, with automatic rollback if anything fails.

Nothing is executed blindly. Everything is planned, previewed, validated, and
approved first.

---

## Cast of characters

| Role                 | What it is                                                                                                                 | Lives in                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Admin**            | The human user logged into the Studio web UI. Must have "Manage Server" permission in the target Discord guild.            | browser                                        |
| **Studio UI**        | The chat-style web frontend. Shows the planner's reasoning, the preview, and the approve/execute buttons.                  | `apps/web/`                                    |
| **API server**       | Hono HTTP server. Routes, auth, SSE streams.                                                                               | `apps/server/src/hono/`                        |
| **Planner**          | The AI loop that turns a sentence into a structured plan. Calls an LLM and a set of 17 tools.                              | `apps/server/src/planning/planning-session.ts` |
| **Diff engine**      | Compares "what we want" vs "what Discord has" → ordered step list.                                                         | `apps/server/src/planning/diff-engine.ts`      |
| **Validator**        | Hard-coded safety checks + an LLM policy check against the server's own rules.                                             | `apps/server/src/planning/validation.ts`       |
| **Execution engine** | Runs each step against live Discord. Resolves placeholders, retries, rolls back.                                           | `apps/server/src/planning/execution-engine.ts` |
| **Bot**              | A Discord.js client that holds the bot's token and performs the actual Discord API calls.                                  | `apps/server/src/bot/`                         |
| **Cache**            | The bot's in-memory snapshot of the guild (channels, roles, members, permission overwrites). Kept fresh by Discord events. | `apps/server/src/bot/cache.ts`                 |
| **PostgreSQL**       | Persistent storage: conversations, plans, snapshots, rules, drift events.                                                  | `packages/db/`                                 |

Before walking the flow, two concepts need explaining because every stage
relies on them: how the system _reads_ Discord (next section), and how it
_tells_ Discord to change (the section after that).

---

## Where the server state comes from (the Discord APIs we use)

Throughout the flow you'll see phrases like "build a ServerState from the
bot's cache" and "fetch fresh state from Discord". This section explains
which Discord surface is used where, and why the distinction matters.

Discord exposes two surfaces to a bot. Discord.js wraps both; this platform
uses the library rather than calling the raw HTTP endpoints, but the
underlying surface is the same.

| Surface                 | What it is                                                                                                                                                             | When our system uses it                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gateway** (WebSocket) | A persistent socket Discord pushes events over: channel created, role updated, member joined, etc. Discord.js keeps a local in-memory cache in sync with these events. | Continuously. On bot startup and every channel/role/member event, the bot updates `guildCache`. Relevant external structural changes are also persisted and streamed as drift at this observation point; events under an execution lock are treated as expected plan effects.                                                                               |
| **REST API**            | Standard HTTPS GET/POST against `https://discord.com/api/v10/...`. Slower (real network call), rate-limited by Discord.                                                | When a guaranteed-fresh guild read is required, principally the post-execution snapshot, rollback comparison, and boot-time member listing. `buildCurrentStateFromDiscord` calls `guild.channels.fetch()`, `guild.roles.fetch()`, and `guild.members.fetch()`. The periodic drift comparator is a cache-consistency fallback, not an independent REST poll. |

**The cache is the source of truth during planning.** When the admin sends a
request and the server builds the initial `ServerState`, it reads from
`guildCache` — no REST call goes out. This keeps planning latency low and
avoids Discord rate limits.

**The REST surface is the source of truth at the boundaries.** After a plan
finishes executing, the system ignores the cache and fetches fresh state via
REST (`buildCurrentStateFromDiscord`), because Discord.js may not have
absorbed all the gateway events from our own execution yet — there is always
a small propagation delay. The after-snapshot is written from that fresh
fetch.

### Concrete Discord.js method → Discord REST endpoint mapping

Discord.js handles authentication, retries, and rate-limit buckets; the table
below is what it maps to under the hood.

| Discord.js call                                        | Underlying REST endpoint                                        | Used by this system for                                       |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- |
| `guild.channels.cache` / `guild.channels.fetch()`      | `GET /guilds/{guild.id}/channels`                               | `ServerState.channels` (cache) and the after-snapshot (fetch) |
| `guild.roles.cache` / `guild.roles.fetch()`            | `GET /guilds/{guild.id}/roles`                                  | `ServerState.roles` and the after-snapshot                    |
| `guild.members.fetch()`                                | `GET /guilds/{guild.id}/members?limit=...`                      | `ServerState.memberRoles` (boot), the after-snapshot          |
| `channel.permissionOverwrites.cache`                   | Returned with the channel payload                               | `ServerState.overwrites`                                      |
| `guild.members.cache.get(botId).permissions`           | Derived from the member's role bitfield                         | `botHasAdministrator` permission check                        |
| `guild.channels.create(name, options)`                 | `POST /guilds/{guild.id}/channels`                              | Tool: `create_channel` / `create_category`                    |
| `channel.edit(options)`                                | `PATCH /channels/{channel.id}`                                  | Tools: `edit_channel`, `move_channel`                         |
| `channel.delete()`                                     | `DELETE /channels/{channel.id}`                                 | Tool: `delete_channel`                                        |
| `guild.roles.create(options)`                          | `POST /guilds/{guild.id}/roles`                                 | Tool: `create_role`                                           |
| `role.edit(options)`                                   | `PATCH /guilds/{guild.id}/roles/{role.id}`                      | Tools: `edit_role`, `move_role`                               |
| `role.delete()`                                        | `DELETE /guilds/{guild.id}/roles/{role.id}`                     | Tool: `delete_role`                                           |
| `channel.permissionOverwrites.create(target, options)` | `PUT /channels/{channel.id}/permissions/{target.id}`            | Tool: `set_overwrite`                                         |
| `channel.permissionOverwriteDelete(target)`            | `DELETE /channels/{channel.id}/permissions/{target.id}`         | Tool: `remove_overwrite`                                      |
| `member.roles.add(roleId)`                             | `PUT /guilds/{guild.id}/members/{member.id}/roles/{role.id}`    | Tool: `add_role_to_member`                                    |
| `member.roles.remove(roleId)`                          | `DELETE /guilds/{guild.id}/members/{member.id}/roles/{role.id}` | Tool: `remove_role_from_member`                               |

The bot authenticates with `Authorization: Bot <DISCORD_BOT_TOKEN>` on every
REST call. Discord applies its own per-route rate limits; the execution
engine's retry-with-backoff (described later) handles `429` responses
transparently.

---

## Tool calls: what they are, who made them

When the planner runs, it doesn't write free-form text that we then parse. It
uses a mechanism called **function calling** (also known as "tool calling") —
a standard introduced by OpenAI in 2023 and now supported by every major LLM
provider, including the OpenRouter endpoint this platform talks to.

### What function calling is

In a normal chat, the LLM produces text. With function calling, the LLM is
also given a list of named functions it can decide to call. Each function has
a name, a description in plain English, and a JSON schema describing the
parameters it accepts. When the LLM decides a function is relevant, it emits
a structured `tool_call` object (function name + arguments) instead of, or
alongside, text. The caller executes the function locally, feeds the result
back to the LLM as a `tool` message, and the conversation continues.

The LLM never runs the function itself — it only tells us _which_ function
to call and with _what_ arguments. All execution happens in our code.

### Who defined the tools here

**We did.** All 17 tools are defined in this codebase in
`packages/shared/src/tools/registry.ts` (split across `categories.ts`,
`channels.ts`, `roles.ts`, `permissions.ts`, `members.ts`, and
`interaction.ts`). They are not part of Discord.js, not part of the LLM
provider, and not imported from any third-party library. `getOpenAIFunctionDefinitions()`
wraps them in the OpenAI function-calling JSON-schema shape so the LLM
provider understands them.

Each tool is a plain TypeScript object with four parts:

| Part                                                                             | What it's for                                                                                                                          |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `name` + `description` + `parameters` (a Zod schema)                             | The part the LLM sees. Serialized via `getOpenAIFunctionDefinitions()` and sent in every `callLLM` request as `tools`.                 |
| `plan(params, store)`                                                            | Mutates the in-memory `DesiredState` when the LLM calls the tool. **No Discord side effect.** This is the "thinking" half of the tool. |
| `getAssumptions(params)`                                                         | Pre-execution checks (parent category exists, no name conflict, etc.) that run before any Discord call.                                |
| `execute(params, ctx)` (separately, in `apps/server/src/bot/execute-context.ts`) | Runs against live Discord via the `DiscordExecuteContext`. This is the "acting" half — only runs at Stage 7, never during planning.    |

The split between `plan()` and `execute()` is the heart of the platform's
"plan-first, never-imperative" design: the LLM can only ever mutate the
_imagined_ state. Real Discord isn't touched until the admin approves and
execution begins.

### The 17 tools

| Tool                      | What `plan()` records in DesiredState                      | What `execute()` does to live Discord                                   |
| ------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `create_category`         | New category entry with a `$symbol` placeholder ID         | POST a new channel of type Category                                     |
| `edit_category`           | Mutated fields on the category entry                       | PATCH the channel                                                       |
| `delete_category`         | Tombstone entry for the category                           | DELETE the channel                                                      |
| `create_channel`          | New channel entry under a parent, with `$symbol`           | POST a new channel                                                      |
| `edit_channel`            | Mutated fields (topic, NSFW, rate limit, forum tags, etc.) | PATCH the channel                                                       |
| `move_channel`            | Changed `position` / `parentId` on the channel             | PATCH with new position/parent                                          |
| `delete_channel`          | Tombstone entry for the channel                            | DELETE the channel                                                      |
| `create_role`             | New role entry with `$symbol`, permissions as names        | POST a new role                                                         |
| `edit_role`               | Mutated role fields (color, hoist, permissions, etc.)      | PATCH the role                                                          |
| `move_role`               | Changed `position` on the role                             | PATCH with new position                                                 |
| `delete_role`             | Tombstone entry for the role                               | DELETE the role                                                         |
| `set_overwrite`           | A `PermissionOverwrite` record keyed by `channel:role`     | PUT a permission overwrite on the channel                               |
| `remove_overwrite`        | Tombstone for the overwrite record                         | DELETE the permission overwrite                                         |
| `batch_set_overwrite`     | Several overwrite records at once                          | Loop of PUTs (one per overwrite)                                        |
| `add_role_to_member`      | Member's `roleIds` array extended                          | PUT member-role association                                             |
| `remove_role_from_member` | Member's `roleIds` array reduced                           | DELETE member-role association                                          |
| `ask_user`                | (Special — pauses the loop, no state mutation)             | (Special — emits a question SSE event and waits for the admin's answer) |

### Where the tool definitions get sent to the LLM

In `planning-session.ts`'s `callLLM`, the full tool set is serialized via
`getOpenAIFunctionDefinitions()` and included in the request body as the
`tools` field. The LLM's streamed reply contains tool-call deltas that the
hand-written `stream-parser.ts` accumulates into complete tool calls before
dispatching them to the matching `plan()` function.

### Why this matters

Because the tool surface is the only way the LLM can affect anything, we get
two guarantees for free:

1. The LLM can never reach Discord directly. It can only describe intent
   through tools we defined, with parameters we validate (via Zod).
2. Every intent the LLM has is captured in the `DesiredState`. Approve,
   preview-revert, manual-edit, validation, and diff all operate on that one
   structure — never on raw LLM text.

---

## The flow, step by step

Throughout, we'll use one example request:

> **Admin types:** "Make a Support section with three text channels —
> #help, #tickets, #faq — and a Helper role that can read all of them."

### Stage 1 — The admin sends a request

The admin opens the Studio page for their guild and types the request into
the chat box. The browser sends it to the server:

```
POST /api/guilds/<guildId>/conversations
{ "userPrompt": "Make a Support section with three text channels..." }
```

Source: `apps/server/src/hono/routes/conversations.ts` — `POST /` handler.

Before doing anything, the server checks:

- The user is logged in (Better Auth session).
- The user has "Manage Server" permission in this Discord guild
  (`auth/helpers.ts: userHasManageGuild`).
- The bot is in the guild and has ADMINISTRATOR
  (`planning/guild-check.ts: checkGuildOperable`).
- No other plan is currently executing for this guild
  (`planning/locking.ts: isGuildLocked`).

If any check fails, the request is rejected before any AI runs.

### Stage 2 — Snapshot the current state

The server builds a `ServerState` object — a flat description of what the
guild looks like right now — from the bot's in-memory cache (the
"cache" character in the cast above; details in the "Where the server state
comes from" section):

```
ServerState = {
  guildId, guildName, memberCount,
  channels: [...],     // every channel + its settings
  roles: [...],        // every role + its permissions
  overwrites: [...],   // per-channel permission overrides per role
  memberRoles: [...],  // which members hold which roles
}
```

It hashes this state into a `forkStateHash` (SHA-256 over a deterministic
serialization). This hash is stored on the conversation row. Later, when the
admin clicks Approve or Execute, the system re-hashes the current state and
compares. If the hashes differ, the request is rejected as "stale" — the
planner's view of the world no longer matches Discord.

Sources: `routes/conversations.ts: buildServerState`, `hash-server-state.ts`.

### Stage 3 — Fork into a "desired state"

The planning session calls `DesiredStateStore.fork(serverState)`. This copies
the current `ServerState` into a `DesiredState` — the same shape but keyed
by ID, with empty "tombstones" (entities to be deleted) and a `symbolCounter`
at zero.

The planner will mutate this `DesiredState` only, never the real Discord
guild. Real Discord stays untouched until Stage 7.

Sources: `packages/shared/src/state/fork.ts`, `state/desired-state-store.ts`.

### Stage 4 — The planner runs (the AI loop)

(For what "function calling" and "the 17 tools" actually mean, see the "Tool
calls" section above. What follows is the runtime loop that uses them.)

A `PlanningSession` is created and started in the background. It is _not_
blocking the HTTP request — the server returns the conversation ID
immediately, and progress flows back to the browser over Server-Sent Events:

```
GET /api/conversations/<id>/stream    (text/event-stream)
```

The planner's loop (max 20 turns):

1. Build a system prompt with four parts:
   - **Goal** — what the admin asked for.
   - **Tools** — the 17 available tools (`create_channel`, `create_role`,
     `set_overwrite`, `ask_user`, etc.) with their parameters.
   - **Permission strategy** — Discord permission rules the planner must obey.
   - **Format** — how to call tools and when to stop.
     The current `ServerState` is included as text via the formatter
     (`bot/formatter.ts`).
2. Call the LLM (`planning-session.ts: callLLM`). This is a raw `fetch` POST
   to an OpenAI-compatible chat-completions endpoint. No SDK is used. The
   response is streamed.
3. Parse the stream (`stream-parser.ts: parseOpenRouterStream`). Tool-call
   arguments arrive in fragments; the parser accumulates them and fires
   `onToolCall` per completed call.
4. For each tool call, the registry looks up the tool
   (`tools/registry.ts: getTool`) and the tool's `plan()` function mutates
   the `DesiredState`. New entities get a placeholder name called a "symbol",
   e.g. `$channel1`, `$role1`. The real Discord ID isn't known yet — that's
   resolved at execution time.
5. Tool results go back to the LLM as the next message; the loop repeats.
6. When the LLM stops calling tools and emits a final text answer, the
   session status becomes `completed` and a `completed` event is sent over
   SSE with the planner's summary.

For our example, by the end of planning the `DesiredState` contains:

- A new category `Support` (symbol: `$category1`).
- Three new text channels `#help`, `#tickets`, `#faq` (symbols: `$channel1`,
  `$channel2`, `$channel3`), each parented to `$category1`.
- A new role `Helper` (symbol: `$role1`) with read-message permission.
- Three `set_overwrite` calls linking `$role1` to each new channel with
  read+view allowed.

Every turn's `DesiredState` snapshot is saved to the DB as a
`plan_iterations` row. The admin can revert to any earlier iteration from the
UI.

### Stage 4a — The planner can ask the admin questions

If the planner needs clarification, it calls the `ask_user` tool — the only
tool that pauses the loop. The session status becomes `waiting_for_user`, an
`ask_user` SSE event is sent with the question, and a 2-minute timeout starts.

The admin answers via:

```
POST /api/guilds/<guildId>/conversations/<id>/ask-user
{ "answer": "yes, make #tickets private" }
```

The answer is appended to the conversation as a tool-result message and the
loop resumes. If the admin doesn't answer in 2 minutes, the session expires.

### Stage 4b — Revise, revert, manual edit

At any "completed" pause the admin can:

- **Revise** — send a new prompt; the loop continues with a fresh user message.
- **Revert** — restore the store to an earlier `plan_iterations` snapshot.
- **Edit state** — replace the desired state entirely with a hand-edited
  version (the Studio's manual editor).

Sources: `routes/conversations.ts` (`revise`, `revert/:version`,
`edit-state`).

### Stage 5 — Approval

When the admin is happy with the preview, they click Approve:

```
POST /api/guilds/<guildId>/conversations/<id>/approve
```

The server checks the conversation isn't stale (hash check), then writes a
new `plans` row containing the final `DesiredState` and the LLM's summary
as the approved "contract". The planning session is torn down; its job is
done.

Source: `routes/conversations.ts: POST /:convId/approve`.

### Stage 6 — Execution kicks off

The admin clicks Execute:

```
POST /api/guilds/<guildId>/plans/<planId>/execute
```

The server, in order (`routes/plans.ts: POST /:planId/execute`):

1. Reloads the plan, re-checks guild access.
2. Re-hashes the current `ServerState` and compares to the conversation's
   `forkStateHash`. If Discord changed since planning, aborts with 409.
3. Rebuilds `ServerState` from the cache.
4. Loads the approved `DesiredState` from `plan.planData`.
5. **Runs the diff engine.** `diffEngine(serverState, desiredState)` returns
   `{ steps: PlanStep[], symbolTable }` via three phases:
   - **Phase 1 — Generate raw steps**: classify every desired entity as
     create / edit / delete / move / no-op.
   - **Phase 2 — Topological sort**: order by tool category and by symbol
     dependencies (a channel referencing `$category1` must come after the
     category is created).
   - **Phase 3 — Optimize**: merge consecutive edits on the same target,
     drop no-ops, detect overwrite consolidation.
6. **Pre-execution assumption checks** (`tools/evaluate-assumptions.ts`):
   for every step, verify parent categories exist, no name collisions, the
   bot's role is higher than any role being modified, etc. Failures abort
   execution before any Discord call.
7. **Validation pipeline** (`validation.ts: validatePlan`):
   - Stage 1 — five groups of hard-coded structural checks (bot hierarchy,
     resource limits, dependency integrity, overwrite consolidation, plan
     integrity).
   - Stage 2 — an LLM policy check against the guild's own `rules` table
     (`validateWithLLM`). The LLM returns structured JSON; violations become
     blocker or warning issues.
8. Acquires the per-guild execution lock (only one plan runs per guild at a
   time; tracked in PostgreSQL with heartbeat and stale-lock cleanup).
9. Saves an **`execution_before` snapshot** of the full `ServerState` —
   used for rollback later.
10. Sets plan status to `executing` and starts the execution engine.

### Stage 7 — The execution engine runs each step

`execution-engine.ts: executePlan` iterates steps in order. For each step
(each step is one of the 17 tools from the "Tool calls" section, with the
`execute()` half firing now against live Discord):

1. **Resolve symbols.** Replace every `$symbol` in the step's parameters
   with the real Discord ID captured from a previous step's result. When
   `create_category` for `$category1` completes, its real Discord ID is
   written to the symbol table. Subsequent `create_channel` steps now read
   `$category1` from the table and substitute the real ID.
2. **Call the tool's `execute(params, ctx)`.** `ctx` is a
   `DiscordExecuteContext` wrapping the live Discord.js guild — every call
   here is a real HTTP request to the Discord REST API (see the
   method-to-endpoint table in the "Where the server state comes from"
   section).
3. **Emit events** over SSE (`/api/plans/:id/stream`) — `step_started`,
   `step_completed`, `step_failed`. The Studio UI shows a live log.
4. **On transient error** (rate limit 429, server 500, network timeout):
   retry with exponential backoff + jitter, up to `MAX_RETRIES`.
5. **On known/permanent error**: fail the step.
6. **On failure, roll back**. The engine calls `rollbackFull`, which reads fresh
   Discord state, forks the `execution_before` snapshot into a DesiredState, runs
   the diff engine to compute the reverse steps, and executes them against the
   same `ExecuteContext`. Rollback is a whole-state reconciliation, not a per-step
   inverse replay.
   Anything that ran gets reverted.

For our example, the execution order is:

```
1. create_category  "Support"             → captures real Discord ID for $category1
2. create_channel   "#help"    parent=$category1 → captures $channel1
3. create_channel   "#tickets" parent=$category1 → captures $channel2
4. create_channel   "#faq"     parent=$category1 → captures $channel3
5. create_role      "Helper"   read perms         → captures $role1
6. set_overwrite    channel=$channel1 role=$role1 allow: read+view
7. set_overwrite    channel=$channel2 role=$role1 allow: read+view
8. set_overwrite    channel=$channel3 role=$role1 allow: read+view
```

As each step completes, the Studio's right panel shows the channel
appearing. By the end, the Discord server physically contains the Support
category, the three channels, and the Helper role with the right
permissions.

### Stage 8 — After execution

1. Server fetches a fresh state from Discord via REST (not from cache, which
   lags) and writes an **`execution_after` snapshot**.
2. Plan updated: `status = completed`, `completedAt`, the per-step Discord
   IDs are recorded in `planData.executionSteps`.
3. **Drift cascade**: the server hashes the after-state. For every other
   conversation in this guild whose `forkStateHash` no longer matches, it
   marks them `stale` — Approve is now blocked for those. For each active
   planning session that is now stale, the server cancels it and emits an
   `expired` SSE event. This is how the system refuses to act on out-of-date
   knowledge.
4. The execution lock is released; the abort controller and heartbeat are
   cleaned up.

### Stage 9 — Rollback (if the admin wants to undo)

Any `completed` plan can be rolled back:

```
POST /api/guilds/<guildId>/plans/<planId>/rollback
```

The server loads the `execution_before` snapshot, forks it into a
`DesiredState`, diffs current → before (reverse direction), generates
rollback steps, acquires the lock, and runs them through the same execution
engine. The Support section disappears from Discord.

If execution failed mid-way and a before-snapshot exists, the same rollback
happens automatically before the error response goes out — so a failed plan
should leave Discord as it was before. If the bot disconnected mid-execution
(no live guild), rollback is skipped and the user is told the state is
partially mutated and needs manual review.

### Stage 10 — Drift detection (background)

Even with no admin action, Discord can change — someone renames a channel
via the regular Discord UI. A background drift detector polls each guild on
an interval via the REST API (see "Where the server state comes from"),
diffs real Discord state vs cache, and writes a `driftEvents` row on any
divergence. The Studio UI subscribes to a drift SSE stream and shows a
toast with a "Re-fork" action.

Source: `planning/drift-detector.ts`.

---

## ASCII flow diagram

```
   Admin (browser)
       │
       │  1. POST /conversations   { userPrompt: "Make a Support..." }
       ▼
┌───────────────────────────────────────────────────────────────┐
│  Hono API server                                              │
│                                                               │
│  2. Access check  →  3. Build ServerState from cache          │
│  3. forkStateHash  →  3. fork() → DesiredState                 │
│  3. Insert conversation row                                   │
│  4. Create PlanningSession, fire-and-forget .start()          │
│       │                                                       │
│       ▼  ◀── SSE stream back to browser  ──▶                  │
│  ┌──────────────────────────────────────────────────┐          │
│  │  Planner loop (max 20 turns):                   │          │
│  │    build system prompt                          │          │
│  │    callLLM (raw fetch, no SDK, streaming)       │          │
│  │    parseOpenRouterStream (SSE + tool deltas)    │          │
│  │    for each tool_call:                          │          │
│  │      getTool(name).plan(params, store)          │          │
│  │      emit tool_called / tool_result SSE         │          │
│  │      (ask_user → pause loop)                   │          │
│  │    onTurnComplete → save plan_iterations row    │          │
│  │    loop until LLM emits final answer            │          │
│  └──────────────────────────────────────────────────┘          │
│                                                               │
│  5. Admin clicks Approve  →  POST /:convId/approve            │
│       write plans row { desiredState }  (the "contract")      │
│                                                               │
│  6. Admin clicks Execute →  POST /:planId/execute             │
│       re-hash current state, compare to forkStateHash         │
│       diffEngine(serverState, desiredState) → PlanStep[]       │
│       evaluateAssumptions(...)  →  must all pass              │
│       validatePlan(...)        →  Stage 1 + Stage 2 (LLM)     │
│       acquireGuildLock                                         │
│       save execution_before snapshot                          │
│       executePlan({ steps, ctx = DiscordExecuteContext })     │
│           │                                                   │
│           ▼                                                   │
│  ┌────────────────────────────────────────────────────┐        │
│  │  For each PlanStep (one of the 17 tools):         │        │
│  │    resolveSymbols($channel1 → real ID)             │        │
│  │    tool.execute(params, ctx)  ← real Discord API   │        │
│  │    emit step_started / step_completed SSE          │        │
│  │    on transient error: retry + backoff             │        │
│  │    on permanent error: rollbackFull → reverse diff │        │
│  └────────────────────────────────────────────────────┘        │
│                                                               │
│  8. Fetch after state from Discord (REST)                     │
│     write execution_after snapshot                            │
│     mark sibling conversations stale (cascade)                │
│     releaseGuildLock                                           │
└───────────────────────────────────────────────────────────────┘
       │
       │  Every Discord REST call (Discord.js, behind the scenes)
       ▼
   Discord servers (real channels, roles, overwrites appear / change / vanish)
```

---

## What actually happens inside Discord

Every `tool.execute(params, ctx)` call maps to one or more Discord.js guild
API calls, which themselves translate to the REST endpoints listed in the
"Where the server state comes from" section. Concrete example for the
"Support section" request:

| Step (tool)                                                                             | Discord effect (what a member would see)                                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_category { name: "Support" }`                                                   | A new channel of type Category appears in the guild. The bot's response includes the real Discord channel ID, which the engine captures into the symbol table. |
| `create_channel { name: "help", parent_id: <real>, type: "text" }`                      | A new text channel is created under the Support category. Visible to anyone with view permissions.                                                             |
| `create_role { name: "Helper", permissions: ["VIEW_CHANNEL", "READ_MESSAGE_HISTORY"] }` | A new guild role is created. Its position is set to just above the bot's own role by default.                                                                  |
| `set_overwrite { channel_id, role_id, allow: [...], deny: [...] }`                      | A permission overwrite is attached to the channel for that role. Members with `Helper` can now read #help.                                                     |
| `add_role_to_member { member_id, role_id }`                                             | The Helper role is attached to that member.                                                                                                                    |
| `delete_channel { channel_id }`                                                         | The channel is deleted from Discord. (Used by rollback and by any "remove this channel" intent.)                                                               |

Each call hits `https://discord.com/api/v10/...` through the bot's token.
The rate limit (Discord's, not ours) is handled by retry-with-backoff inside
the execution engine.

---

## Safety nets

| Mechanism                           | What it prevents                                                                                                                                      | Source                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Per-guild execution lock**        | Two plans running against the same guild at once                                                                                                      | `planning/locking.ts`                                            |
| **Stale-hash check**                | Approving/executing a plan whose view of Discord is out of date                                                                                       | `forkStateHash` on `conversations`, checked at approve + execute |
| **Stage 1 validation**              | Structural impossibilities — bot can't edit a role above its own, can't delete unknown IDs, can't create two channels with the same name              | `planning/validation.ts` Groups A–E                              |
| **Stage 2 LLM policy check**        | Plans that violate the server's own written rules (e.g. "never delete #welcome")                                                                      | `validateWithLLM` against the `rules` table                      |
| **Pre-execution assumption checks** | Parent missing, name collision at the moment of execution, hierarchy violations                                                                       | `tools/evaluate-assumptions.ts`                                  |
| **Diff-based rollback**             | If a step fails after earlier steps already ran, the whole plan is undone by diffing live state against the before-snapshot and executing the reverse | `execution-engine.ts: rollbackFull`                              |
| **Snapshot + manual rollback**      | Admin can undo any completed plan after the fact                                                                                                      | `execution_before` / `execution_after` snapshots                 |
| **Drift detector**                  | External edits (someone reconfiguring the server via the Discord app) are surfaced to the admin                                                       | `planning/drift-detector.ts`                                     |
| **5-minute execution timeout**      | A stuck execution is aborted, lock is released, rollback runs                                                                                         | `routes/plans.ts`                                                |
| **Bot-disconnect guard**            | If the bot is gone mid-execution, skip rollback and tell the admin the state may be partially mutated                                                 | `routes/plans.ts`                                                |

---

## Glossary

- **Guild** — Discord's term for a server. Used throughout the API; we
  expose it as `guildId`.
- **ServerState** — What the Discord guild looks like right now. Flat
  arrays, real Discord IDs. Built from the bot's in-memory cache during
  planning, or fetched fresh via REST at the boundary snapshots.
- **DesiredState** — What the admin wants the guild to look like. Same
  shape as `ServerState` but keyed by ID, with tombstones and a symbol
  counter. This is the only thing the planner ever modifies.
- **Tombstone** — A marker that an entity should be deleted at execution
  time. Storing deletes as tombstones (instead of dropping the entry) lets
  the diff engine emit an explicit `delete_*` step and lets the admin revert
  a deletion with one click.
- **Symbol** — A placeholder like `$channel1` used during planning for an
  entity that doesn't exist in Discord yet. Resolved to a real Discord ID at
  execution time, after the create step runs.
- **PlanStep** — One atomic action to perform against Discord. Has a tool
  name (e.g. `create_channel`), parameters, and an optional symbol it
  produces.
- **SymbolTable** — Maps symbols → real Discord IDs. Populated as execution
  progresses.
- **SSE** — Server-Sent Events. A long-lived HTTP stream the browser
  subscribes to so the server can push updates without polling.
- **Function calling / tool calling** — The LLM mechanism this system uses
  to let the model express structured intent. The LLM emits a `tool_call`
  object (function name + JSON arguments) instead of free-form text; the
  caller runs the function locally. The 17 tools are defined in this
  codebase, not by the LLM provider.
- **Diff engine** — The algorithm that turns "what we want" minus "what we
  have" into an ordered list of `PlanStep`s.
- **Inverse tool** — The tool that undoes another tool (e.g.
  `delete_channel` is the inverse of `create_channel`). Used for rollback.
- **Fork** — The act of copying a `ServerState` into a fresh `DesiredState`
  so the planner can mutate it freely.
- **forkStateHash** — A SHA-256 over the `ServerState` at fork time.
  Stored on the conversation, compared later to detect drift.
- **Iteration** — A saved snapshot of the `DesiredState` after one planner
  turn. Forms the iteration history the admin can revert to.

---

## File map (for verifiability)

| Stage               | File(s)                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. Send request     | `apps/server/src/hono/routes/conversations.ts` (`POST /`)                                                   |
| 2. Snapshot state   | `apps/server/src/bot/cache.ts`, `buildServerState` in routes, `packages/shared/src/hash-server-state.ts`    |
| 3. Fork             | `packages/shared/src/state/fork.ts`, `state/desired-state-store.ts`                                         |
| 4. Planner loop     | `apps/server/src/planning/planning-session.ts`, `llm-request.ts`, `stream-parser.ts`, `tools/registry.ts`   |
| 4a. ask_user        | `routes/conversations.ts` (`POST /:convId/ask-user`)                                                        |
| 5. Approve          | `routes/conversations.ts` (`POST /:convId/approve`)                                                         |
| 6. Execute kickoff  | `apps/server/src/hono/routes/plans.ts` (`POST /:planId/execute`)                                            |
| 7. Execution engine | `apps/server/src/planning/execution-engine.ts`, `bot/execute-context.ts`                                    |
| 8. After            | `routes/plans.ts` (snapshot writes, drift cascade, lock release)                                            |
| 9. Rollback         | `routes/plans.ts` (`POST /:planId/rollback`), `execution-engine.ts: rollbackFull`                           |
| 10. Drift detector  | `apps/server/src/planning/drift-detector.ts`                                                                |
| Tool definitions    | `packages/shared/src/tools/registry.ts` + per-category files                                                |
| Discord API surface | `apps/server/src/bot/index.ts` (gateway events), `execution-engine.ts: buildCurrentStateFromDiscord` (REST) |
