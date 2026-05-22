# Open Design Issues

Outstanding design decisions that need resolution before or during implementation.
Ranked by downstream dependency — issues earlier in the list block more things.

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

**Status:** OPEN  
**Blocked by:** None (independent)

How the bot's in-memory cache (Maps of CacheEntry) gets converted into a DesiredState
structure at Phase 1 (Intake). The design says "fork desired state" but the concrete
algorithm is unspecified.

Key decisions:
- Deep copy vs. construct new objects?
- How are cache types (ChannelCacheEntry) mapped to domain types (Channel)?
- How are overwrites forked? (composite key = channelId+roleId)
- Do categories get forked as Channel entries in the same Map, or as a separate type?

**Downstream:** Diff engine, tool `plan()` functions, and iteration snapshots all depend on
the DesiredState shape. The fork algorithm determines that shape.

---

## 3. Planning Loop Implementation Design

**Status:** OPEN  
**Blocked by:** LLM SDK choice (#1), Fork Algorithm (#2)

The state machine that drives the LLM → tool dispatch → modify desired state loop.
The design doc has an ASCII diagram but no concrete implementation spec.

Key decisions:
- How does the loop serialize/deserialize to DB for persistence across pauses?
- What does "resume from DB" look like in code?
- How are Vercel AI SDK / OpenRouter calls wired into the loop?
- How does the loop track state (thinking, dispatching, paused, errored, done)?
- What data structure captures loop state for ask_user pause/resume?
- How does iteration management interact with the loop?
- How does context window tracking work (calculate % used, warn user)?

**Downstream:** Everything — tool dispatch, conversation persistence, ask_user, SSE streaming,
iteration management — plugs into this. This is the central orchestrator.

---

## 4. Tool Registry + Dispatch Design

**Status:** OPEN  
**Blocked by:** Planning Loop (#3)

The 14 tool schemas exist as Zod validators in `packages/shared/src/tools/`. The design
says each tool exports `plan()`, `execute()`, and `getAssumptions()` but there is no
TypeScript interface for the tool contract, no registry, and no dispatch mechanism.

Key decisions:
- TypeScript interface for a Tool (what `plan()`, `execute()`, `getAssumptions()` look like)
- Registry: how tools are registered, discovered, and looked up by name
- Dispatch: how the planning loop routes tool calls to the right tool
- ImmediateTool vs DeferredTool split: how the dispatch knows the difference
- How `plan()` receives and modifies DesiredState (what's the function signature?)
- How retry logic (3 retries per tool call) integrates with dispatch

**Downstream:** The entire tool-calling pipeline. Cannot build the planning loop without this.

---

## 5. SSE Event Protocol

**Status:** OPEN  
**Blocked by:** Planning Loop (#3)

SSE is chosen as the real-time transport, but the event format contract is undefined.
The design mentions "live execution status" but no concrete event types or payloads.

Key decisions:
- Event types: step_started, step_completed, step_failed, plan_completed, plan_failed, error?
- Payload structure for each event type
- Reconnection semantics (last event ID, resume from where?)
- How are completed items rendered in the Discord clone during execution?
- How does Studio transition from "planning" to "executing" to "completed" states?

**Downstream:** Frontend Studio UI and server SSE handler. Both sides need the same contract.

---

## 6. Planning API Contract

**Status:** OPEN  
**Blocked by:** Planning Loop (#3), Fork Algorithm (#2)

REST endpoints for the planning flow. Currently no endpoints exist for starting a plan,
submitting prompts, or approving execution.

Expected endpoints:
- `POST /api/conversations/:id/prompt` — submit a new planning prompt
- `POST /api/conversations/:id/ask_user-response` — respond to ask_user
- `POST /api/conversations/:id/approve` — approve and execute plan
- `GET /api/conversations/:id/stream` — SSE stream (placeholder exists)
- `GET /api/conversations/:id/iterations` — list iteration snapshots
- `POST /api/conversations/:id/revert/:version` — revert to past iteration

**Downstream:** Frontend cannot integrate the planning flow without these.

---

## 7. System Prompt Architecture

**Status:** OPEN (can be deferred — content, not architecture)

What the LLM receives on each planning turn. Sections include: server state text,
tool definitions, guidance documents, server rules, conversation history, user prompt.

Key decisions:
- Section ordering and format
- How guidance files are selected and loaded
- How templates are serialized for the prompt
- How conversation history truncation works
- Name guidance (soft limits) formatting

**Downstream:** LLM behavior quality. Can be iterated on continuously without affecting code architecture.

---

## 8. ask_user State Persistence

**Status:** DESIGN DECIDED — implementation needed

When `ask_user` pauses the planning loop, the conversation state must be persisted.
Design: conversation model handles this via stored messages array. The loop serializes
to DB and resumes when user responds.

**Downstream:** ask_user tool implementation, conversation persistence.

---

## 9. Diff Engine Matching Heuristics

**Status:** OPEN — to be refined during implementation

The diff engine matches items between desired state and real state. Existing items
matched by Discord ID (trivial). New items matched by name + parent + type.

Open questions: name similarity threshold, parent match requirements, how to handle
position-only changes.

**Downstream:** Diff engine Phase 1 (generate raw steps).

---

## 10. Plan Optimizer Heuristics

**Status:** OPEN — to be finalized during implementation

Detecting "delete + create = rename" patterns at approval time. Converts destructive
pairs into edits to preserve message history and role assignments.

Open questions: name similarity threshold, parent match requirements, step proximity.

**Downstream:** Plan optimizer pass (Phase 4, before execution).

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
```
