# Planning & Execution

## Planning Loop

The planning loop is a state machine, not a simple while-loop. It can pause (ask_user), persist to DB, and resume.

```
                    ┌──────────────────────────┐
                    │       CONVERSATION        │
                    │  (persisted in DB)        │
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
              │ desired  │  │  persist to   │
              │ state    │  │  DB, notify   │
              └────┬─────┘  │  frontend     │
                   │        └──────┬───────┘
                   │               │ user responds
                   │               ▼
                   │        ┌──────────────┐
                   │        │  RESUME LOOP │
                   │        │  from DB     │
                   │        └──────┬───────┘
                   │               │
                   ▼               ▼
              ┌──────────────────────┐
              │  loop continues or   │
              │  terminates          │
              └──────────────────────┘
```

### Termination

Implicit: the LLM stops calling tools.
Safety check: zero accepted steps → failure, retry once.
Max iteration cap prevents runaway loops.

### ask_user

The only **ImmediateTool** — executes during the planning loop (pauses, asks the human, returns the answer as a tool result). All 13 other tools are **DeferredTools** — modify desired state during planning, executed on Discord only after user approval.

Supports: multiple choice, multi-select, custom text input.

---

## Tool Calling System

### Unified Tool Registry

14 tools. Single source of truth. Same tools used in planning and execution.

| Category | Tools |
|----------|-------|
| Category | create_category, edit_category, delete_category |
| Channel | create_channel, edit_channel, delete_channel, move_channel |
| Role | create_role, edit_role, delete_role, move_role |
| Permission | set_overwrite, remove_overwrite |
| Interaction | ask_user |

### Tool Interface

Each tool exports:
1. **Zod schema** → validates params, converted to JSON Schema for LLM function calling
2. **plan()** → modifies DesiredState in-memory (no Discord API), returns `{ planned: true, symbol: "$x" }`
3. **execute()** → calls Discord API with resolved IDs (used by execution engine)
4. **getAssumptions(params)** → dynamically generates pre-execution checks (e.g., "parent exists", "no name conflict")

### Validation During Planning

```
LLM calls tool → Zod validates params
  → valid: plan() modifies DesiredState
     → returns { planned: true, symbol: "$ch_1" } to LLM
  → invalid: error back to LLM
     → DesiredState NOT modified (no side effects)
     → LLM retries up to 3 times
```

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

### Step Execution

```
For each step (topologically sorted):
  → Resolve symbols → resolved params
  → Call Discord API via Discord.js
  → Record result (status, discord ID)
  → SSE stream to frontend
```

### Retry Strategy

| Error Type | Action |
|-----------|--------|
| 429 Rate Limit | Handled automatically by Discord.js REST manager |
| 500/502/503/timeout | Retry step up to 3 times, exponential backoff (1s→2s→4s, ±25% jitter) |
| 403/404 (known) | Diagnose via hardcoded fix map, suggest fix to user |
| Unknown errors | LLM receives error + state + step, suggests cause and fix |
| Permanent failure after retries | Roll back ALL completed steps via inverse plan from before-snapshot. No partial state left. |

### Undo / Rollback

- Undo is **system-level**: generates inverse plan from before-snapshot, executes it
- Rollback recreates structure (channels/categories/roles) even if content (messages) lost
- No "planning undo" — use Revise or Studio editing instead

---

## Conversation Model

- Conversations are the top-level unit
- Plans belong to conversations
- Full message history maintained within a conversation
- Cross-conversation context NOT needed (server state is enough)
- New conversation = fresh context + current server state
