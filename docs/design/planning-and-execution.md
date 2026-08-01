# Planning & Execution

## Planning Loop

The planning loop is a state machine, not a simple while-loop. It can pause (ask_user), keep state in server memory, and resume from memory. The conversation's prompt, messages, and completed iterations are logged to the database. On server restart, in-flight work is marked interrupted; a completed persisted iteration remains reviewable and approvable, while further planning starts from current server state.

```
                    ┌──────────────────────────┐
                    │       CONVERSATION        │
                    │  (prompt & messages in    │
                    │   DB, state in memory)    │
                    └──────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
    user prompt ──▶ │  LLM THINKING   │◀──── ask_user response
                    └──────┬───────────┘
                           │ tool calls
                           ▼
                    ┌──────────────────┐
                    │  TOOL DISPATCH   │
                    │  validate + exec │
                    └──┬───────────┬───┘
                       │           │
              deferred │           │ immediate
                       ▼           ▼
               ┌──────────┐  ┌──────────────┐
               │ modify   │  │  PAUSE LOOP   │
               │ desired  │  │  keep state   │
               │ state    │  │  in memory,   │
               └────┬─────┘  │  notify       │
                    │        │  frontend     │
                    │        └──────┬───────┘
                    │               │ user responds
                    │               ▼
                    │        ┌──────────────┐
                    │        │  RESUME LOOP │
                    │        │  from memory │
                    │        └──────┬───────┘
                    │               │
                    ▼               ▼
               ┌──────────────────────┐
               │  loop continues or   │
               │  terminates          │
               └──────────────────────┘
```

### Termination

Implicit: the LLM stops calling tools (finishes a turn with no tool calls).
Max iteration cap prevents runaway loops: `maxTurns = 20` in `planning-session.ts`; on exhaustion the loop force-completes with the summary "Planning reached maximum number of turns."

### ask_user

The only **ImmediateTool** — executes during the planning loop (pauses, asks the human, returns the answer as a tool result). The other 16 tools are **DeferredTools** — they modify desired state during planning and are executed on Discord only after user approval. Of those 16, 15 are `planning_and_execution` tools (each has an `execute()`); `batch_set_overwrite` is `planning_only` — it expands into individual `set_overwrite` steps at plan time and is never dispatched during execution.

Supports: multiple choice, multi-select, custom text input.

---

## Tool Calling System

### Unified Tool Registry

17 tools. Single source of truth. Same tools used in planning and execution.

| Category    | Tools                                                      |
| ----------- | ---------------------------------------------------------- |
| Category    | create_category, edit_category, delete_category            |
| Channel     | create_channel, edit_channel, delete_channel, move_channel |
| Role        | create_role, edit_role, delete_role, move_role             |
| Permission  | set_overwrite, remove_overwrite, batch_set_overwrite       |
| Member      | add_role_to_member, remove_role_from_member                |
| Interaction | ask_user                                                   |

### Tool Interface

Each tool exports:

1. **Zod schema** → validates param shape, converted to JSON Schema for LLM function calling
2. **plan(params, store)** → thin wrapper calling `DesiredStateStore` methods; returns `{ planned: true, symbol?: string }` to the LLM. Symbol is only returned by create tools.
3. **execute(params, ctx)** → calls Discord API via `ExecuteContext` with resolved IDs (used by execution engine)
4. **getAssumptions(params)** → dynamically generates pre-execution checks (e.g., "parent exists", "no name conflict")

### Phased Planning Model

The system prompt enforces a 4-phase planning order. This keeps the LLM focused
and prevents scope creep — the LLM completes one phase before moving to the next.
Phases can be skipped if the user explicitly asks for later-phase work, but the
LLM warns the user in its summary.

Each phase's system prompt explicitly restricts which tools the LLM may use:

```
Phase 1 — FOUNDATION: Roles only
  Tools: create_role, edit_role, delete_role, move_role
  Cannot touch: categories, channels, overwrites, members

Phase 2 — SERVER LAYOUT: Categories + channel structure
  Tools: create_category, edit_category, delete_category,
         create_channel, edit_channel, delete_channel, move_channel
  Cannot touch: roles (edit_role), overwrites, members
  Default: lock_permissions: true on channels under categories

Phase 3 — ACCESS CONTROL: Channel/category overwrites
  Tools: set_overwrite, remove_overwrite, batch_set_overwrite
  Can toggle: lock_permissions via edit_channel (only this field)
  Cannot touch: create/delete channels or roles, member assignments
  Strategy: permissions go on CATEGORIES, not individual channels.
    Only un-sync channels that genuinely need different access.

Phase 4 — PEOPLE: Member role assignments
  Tools: add_role_to_member, remove_role_from_member
  Cannot touch: roles, channels, categories, overwrites
```

**System prompt rules:**

```
- Complete the current phase before starting the next.
- Each phase's prompt explicitly forbids tools from other phases.
- Only plan what the user asked for. Do not expand scope.
- If the user asks for Phase N+1 work without Phases 1..N complete,
  you MAY proceed but MUST note the risk in your summary.
- Use ask_user when the request is ambiguous.
```

**Execution order (TOOL_ORDER)** reflects the phases:

```
 1: create_category
 2: create_channel
 3: create_role
 4: edit_category
 5: edit_channel
 6: edit_role
 7: move_channel
 8: move_role
 9: add_role_to_member           ← Phase 4 (People)
10: remove_role_from_member
11: set_overwrite                ← Phase 3 (Access Control)
12: remove_overwrite
13: delete_channel
14: delete_role
15: delete_category
```

Member role steps run after role creation (symbols must resolve) but before
overwrites. The topological sort ensures `$role_0` is created before any member
is assigned to it. Category/channel creation runs first so the layout exists
before permissions are set.

See [member-role-management.md](./member-role-management.md) for the full member
role and lockPermissions designs.

### DesiredStateStore (Middleware Layer)

All mutation flows through the store. No plan() function touches DesiredState directly.

```
DesiredStateStore {
  static fork(serverState) → DesiredStateStore  // build a store from real Discord state
  getState() → DesiredState           // read current in-memory state
  addChannel(params) → symbol         // create new item with auto-generated symbol
  addCategory(params) → symbol
  addRole(params) → symbol
  editChannel(id, fields)             // modify by Discord ID or symbol
  editCategory(id, fields)
  editRole(id, fields)
  removeChannel(id)                   // move to tombstones, remove from active
  removeCategory(id)
  removeRole(id)
  addMemberRole(memberId, roleId)     // add role to member's DesiredState entry
  removeMemberRole(memberId, roleId)  // remove role from member's DesiredState entry
  setOverwrite(chId, rlId, allow, deny)
  removeOverwrite(chId, rlId)
  nextSymbol(type) → "$ch_3"          // increment counter, return formatted symbol
  snapshot() → DesiredState           // deep-clone for DB persistence
  revert(snapshot)                    // replace state with prior snapshot (cancellation)
}
```

The store validates before mutating. All checks live once in the store, not duplicated across the tools:

| Operation                      | Store-Level Checks                                                 |
| ------------------------------ | ------------------------------------------------------------------ |
| addChannel / addCategory       | No duplicate name in active.channels                               |
| addRole                        | No duplicate name in active.roles                                  |
| editChannel / editRole         | ID or symbol exists in active; name (if changed) is not duplicated |
| removeChannel / removeRole     | ID or symbol exists in active                                      |
| addMemberRole                  | Role reference exists in active.roles; no duplicate assignment     |
| removeMemberRole               | Member entry exists in active.memberRoles; roleId present in array |
| setOverwrite / removeOverwrite | Both channel ref and role ref exist in active                      |

### State Persistence Model

```
WITHIN A TURN:                    BETWEEN TURNS:

  DesiredState in memory           Snapshot saved to plan_iterations table
  (fast mutations per tool call)   (survives server restart)
       │
       │ (LLM stops calling)
       ▼
  store.snapshot() → DB

On server restart: mark in-flight planning as interrupted; retain completed iterations for review and approval.
```

### Validation During Planning

```
LLM calls tool → Zod validates param shape
  → Zod fails → error back to LLM, plan() never called, state untouched
  → Zod passes → plan(params, store) called
      → store validates state-level constraints
      → store fails → error to LLM, store threw before mutating, state untouched
      → store succeeds → state mutated, returns { planned: true, symbol } to LLM
```

### LLM Integration (Streaming)

The LLM call uses streaming fetch. Emitted at **tool-call granularity**, not token level:

```
Server (streaming fetch):
  → LLM starts generating
  → Thinking text accumulates internally during generation
  → When a complete tool_call is accumulated:
      → dispatchTool() immediately
      → emit tool_called + tool_result → frontend updates in real-time
  → When LLM finishes:
      → emit turn_completed { thinking: "...", content: "summary text" }
      → Frontend renders collapsed thinking block + tool call list + answer
```

**Frontend rendering:**

- Thinking block — collapsed `<details>` by default, user expands to see LLM reasoning
- Tool calls — visible as they happen (tool name + params + result)
- Answer text — after all tool calls, streamed or shown at once

No token-by-token streaming to the frontend. The user sees progress at the level
that matters: what tools are being called and what they did.

### Server State Feeding

Server state (structured text) is fed **upfront** in the initial prompt, not fetched via agent-style lookup tools. Compact format keeps token usage low (~1,500-5,000 tokens even for large servers).

---

## Symbolic Reference Resolution

### During Planning

- New items get symbols: `$ch_0`, `$cat_1`, `$role_staff`
- Existing items referenced by name (e.g., "#announcements") — resolved to Discord ID by cache lookup
- LLM uses symbols to reference items it just created

### During Execution

```
SymbolTable {
  "$cat_0": { symbol, type: "category", definingStepIndex: 0 }
  "$ch_0":  { symbol, type: "channel",  definingStepIndex: 2 }
}

Execution Step 1: create_category(...) → Discord returns id "111"
  → SymbolTable["$cat_0"].resolvedDiscordId = "111"

Execution Step 2: create_channel(parent: "$cat_0")
  → Resolver replaces "$cat_0" → "111"
  → resolved_params: { name: "staff-chat", parent_id: "111" }
  → Discord returns id "222"
  → SymbolTable["$ch_0"].resolvedDiscordId = "222"
```

Resolution happens at the **engine level**: before each execution step, symbols in params are replaced with real IDs. Tools only ever receive resolved IDs.

---

## Execution Engine

### ExecuteContext

The `ExecuteContext` is the interface layer between tool `execute()` functions and the Discord.js REST API. Its sole responsibility is calling Discord — it does not resolve symbols, retry, stream SSE, or track state for rollback.

Design decisions:

- **One instance per guild, per plan execution.** The implementation wraps a Discord.js `Guild`. The `guildId` is set at construction and exposed as a readonly property.
- **Stateless.** ExecuteContext does not accumulate what it created or deleted. All execution tracking (symbol table updates, step results, snapshots) lives in the execution engine layer above it.
- **Throws on failure.** All methods throw on Discord API failure. Error classification (transient vs permanent), retry with backoff, and rollback are the execution engine's responsibility — not ExecuteContext's.
- **Lives in `apps/server/`.** The interface lives in `packages/shared/` (importable by both web and server). The implementation wraps `botClient` and lives in the server package.
- **Permission parsing** uses `toPascalCase()` to convert `VIEW_CHANNEL` → `ViewChannel` for Discord.js v14 `PermissionFlagsBits` lookup. This was a bug (originally used `toCamelCase` producing `viewChannel` which never matched).

See [`packages/shared/src/execute-context.ts`](../../packages/shared/src/execute-context.ts) for the interface and error contract.

### Pre-Execution Validation

Before the step loop begins, the system validates the plan against fresh Discord state:

1. Capture before-snapshot of current ServerState (for rollback)
2. Re-read fresh Discord state (channels, roles, permissions, bot position)
3. Run every `getAssumptions()` from the plan's steps against fresh state
4. All pass → proceed to step loop
5. Any fail → block execution, show conflict summary, offer re-plan with fresh state (see [validation-and-safety.md](./validation-and-safety.md#conflict-resolution-re-plan-with-fresh-state))

### Step Execution

```
For each step (topologically sorted):
  → Resolve symbols → resolved params
  → Dispatch step to tool-specific execution handler
  → Call Discord API via Discord.js
  → Record result (status, discord ID)
  → SSE stream to frontend
```

The dispatch switch handles all 15 planning_and_execution tools (including
`add_role_to_member` and `remove_role_from_member`). Member tools don't create
symbols (members use Discord IDs), but role params may contain symbols
(`$role_0`) — resolved by the existing symbol resolution before dispatch.

### Retry Strategy

| Error Type                      | Action                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 429 Rate Limit                  | Handled automatically by Discord.js REST manager                                                                                                 |
| 500/502/503/timeout             | Retry step up to 3 times, exponential backoff (1s→2s→4s, ±25% jitter)                                                                            |
| 403/404/400 (known)             | Diagnose via hardcoded fix map in `diagnoseError()`, fail step, rollback                                                                         |
| Unknown errors                  | Fail step, full rollback, offer re-plan with fresh state — **never ask the LLM for diagnosis**                                                   |
| Permanent failure after retries | Full rollback via `rollbackFull()` — diff current Discord state against the before-snapshot and execute the reverse diff. No partial state left. |

### How Tool Results Feed the LLM

Every tool call returns a result to the LLM during planning. This is how the LLM
knows its action succeeded and can reference what it just created:

```
Planning results (plan() return value):
  create_channel("staff-chat")  →  { planned: true, symbol: "$ch_3" }
  edit_channel("123", {name})   →  { planned: true }
  set_overwrite("$ch_3", ...)   →  { planned: true }

Execution results (execute() return value):
  create_channel("staff-chat")  →  { id: "998877665544" }  ← real Discord ID
  edit_channel("123", ...)      →  {}                       ← void
```

Without symbol returns, the LLM couldn't reference items it just created in
subsequent calls (e.g., `set_overwrite(channel_id: "$ch_3", ...)`).

### Undo / Rollback

- Undo is **system-level** and **diff-based**, not per-step inversion. `rollbackFull()` (`execution-engine.ts`) reads fresh Discord state, forks the before-snapshot into a DesiredState, runs the diff engine (`diffEngine(currentState, desiredBefore)`), and executes the resulting reverse steps as a normal plan.
- `completedSteps` is tracked during execution for reporting, but rollback does not walk it — it recomputes the delta from live state, so external changes since execution are handled uniformly.
- Rollback recreates structure (channels/categories/roles) even if content (messages) is lost — best-effort structural rollback.
- No "planning undo" — use Revise or Studio editing instead.

---

## Conversation Model

Conversations are the top-level planning session. The database stores the prompt and LLM chat messages as an audit log. All active planning state (DesiredState, iteration snapshots, tool call context) lives in server memory — not the database.

- Conversations are the top-level unit. Multiple conversations can be active simultaneously if they share the same fork point (identical server state at creation time, verified via `forkStateHash`).
- When any conversation is executed, Discord state changes — all sibling conversations whose `forkStateHash` no longer matches are marked as stale (view-only, not workable).
- The `plan_iterations` table persists DesiredState snapshots across LLM turns and manual edits. Iterations survive server restarts — the user can view history and revert to past versions.
- Browser disconnect (closing a tab) is a non-event. Server memory persists. On reconnect, the client sees everything as it was.
- Server restart destroys the active loop context. Planning or waiting rows are marked interrupted; completed iterations survive and can still be approved from persistence. A new planning turn starts from current server state.
- Plans belong to conversations via `conversationId` FK. This links execution output back to the conversation that produced it.
- No cross-conversation context needed (server state is enough).
- Future idea: smart stale detection — compare which items the plan touches against actual changes, not full server hash (ignore irrelevant changes like bitrate settings). Future idea: rollback to a conversation's fork point to re-enable stale conversations.

### Cancellation Behavior

When the user cancels mid-planning:

- The current LLM turn is aborted. All tool call results from this turn are discarded.
- The DesiredState reverts to the last complete iteration (snapshot taken before this turn began).
- No partial state is left for the LLM to misinterpret on the next turn.
- The conversation remains in the database as a history entry.

When the user cancels during execution:

- Completed steps are rolled back via inverse plan (from before-snapshot captured at execution start).
- The plan status is set to `rolled_back`.
- No partial state is left on Discord.
- The conversation remains in the database.
