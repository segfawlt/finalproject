# Open Issues - To Be Resolved Later

## Resolved (from design discussions)

### 13. Planning Loop Termination ✅ RESOLVED
- Decision: Implicit termination (LLM stops calling tools = done)
- Safety check: zero steps = failure, retry once
- Max iteration cap prevents runaway loops
- Updated in ProjectDescription.md

### 14. `ask_user` State Persistence ✅ RESOLVED
- Decision: Planning session state (full messages array) persisted in DB
- Conversation model handles this naturally — messages are stored per conversation
- When user responds, the same conversation is resumed
- Updated in ProjectDescription.md

### 15. LLM Validation Error Recovery ✅ RESOLVED
- Decision: 3 retries per tool call for LLM mistakes
- Exact validation error displayed to user (no improvised messages)
- After 3 retries: abort, prompt user to rephrase
- System errors (Zod schema bugs, tool definition bugs) are developer fixes, not retries
- Updated in ProjectDescription.md

### 16. Revise Flow — Conversation Context ✅ RESOLVED
- Decision: Keep the same conversation array across revise cycles
- Append new user prompt to existing messages
- LLM naturally continues from where it left off
- Updated in ProjectDescription.md

### A. Execution Stop & Undo ✅ RESOLVED
- Decision: User can stop execution mid-process, completed steps remain
- Undo is system-level (inverse plan from snapshot), not LLM-level
- No "planning undo" — use Revise or Studio editing instead
- Updated in ProjectDescription.md

### B. Conversation Model ✅ RESOLVED
- Decision: Conversations are top-level unit, plans are children
- Full message history maintained within a conversation
- Cross-conversation context NOT needed (server state is enough)
- Memory feature for cross-conversation persistence deferred
- Updated in ProjectDescription.md

### C. Context Window Indicator ✅ RESOLVED
- Decision: Show calculated % of model's max context in UI
- Updated in ProjectDescription.md

### D. Two Execution Modes ❌ OBSOLETE
- Replaced by single Plan Mode. User controls depth by choosing to approve immediately or iterate.
- No mode toggle, no complexity-based routing.
- Updated in ProjectDescription.md.

## Deferred / Not Priority

### 1. Weekly Automated Scan

- Problem Scanner is available via `/scan` and suggested after setup
- Weekly automated scan is costly and not needed for now
- Can add later as an opt-in feature

### 2. Template Versioning

- Current approach: modified template becomes a new template in user's library
- User can choose to publish to community library
- No version tracking within a single template needed yet

### 3. Pub/Sub Mechanism Choice ✅ RESOLVED

- Decision: Phase 1 uses direct function calls (Hono API + Bot in same process)
- No pub/sub, no polling, no message queue needed between API and Bot
- Frontend polls API for execution status (2s interval)
- Phase 2: If split into separate processes, add Redis or PG NOTIFY

### 4. Execution Plan JSON Schema

- Exact structure for plan storage not finalized
- Will define during implementation

### 5. Two-Panel Layout UI Details

- How text panel and Studio preview interact
- Can text items highlight visual elements? Can you edit in visual panel?
- UI design deferred — backbone first

### 6. Server Clone (Discord Sandbox)

- Deferred to later phase
- Bot feature to clone server for preview
- Studio (Web Clone) is the primary preview mechanism for now

### 7. Template Community Submission (Phase 3)

- Submission + review flow for community templates
- Admin-picked section vs user-submitted section
- Deferred — template library starts with curated templates

### 8. Visual Template Builder (Phase 2)

- Drag-and-drop template creation in Studio
- Deferred — Phase 1 is JSON editor

## To Discuss During Implementation

### 9. Channel Importance Thresholds ✅ RESOLVED

- Decision: Percentile-based classification (top 25% IMPORTANT, middle 50% MODERATE, bottom 25% LOW)
- Activity score: (message_count × 0.4) + (recency × 0.3) + (pins × 0.15) + (unique_users × 0.15)
- Primary channel detection: LLM batch call per server (no hardcoded name list)
- Manual override: user can mark channels as Important/Expendable
- Updated in ProjectDescription.md

### 10. Retry Backoff Strategy ✅ RESOLVED

- Decision: Exponential backoff with jitter
- Base delay: 1s, factor: 2, max delay: 8s, ±25% jitter
- Max retries: 3
- 429 rate limits handled by Discord.js REST manager (no custom retry)
- Updated in ProjectDescription.md

### 11. Intent History Inspector ✅ RESOLVED — Not a design concern

- Decision: Drop as architecture concern. Plan already stores results for rollback.
- "Intent history" is just a UI query: search plans by target Discord ID.
- No architectural decisions needed. Can be built as a UI feature later.

### 12. Execution View (Live Discord Clone Update) ✅ RESOLVED

- Decision: Plan steps (todo) + bot execution log (reality) merged in UI
- Bot records step results after each execution: { step_index, status, discord_id, error? }
- Frontend receives live updates via SSE stream (GET /api/plan/:id/stream)
- Single persistent connection, instant updates, browser auto-reconnects
- Completed items rendered in Discord clone, in-progress with spinner, pending greyed out
- Updated in ProjectDescription.md

## New Decisions (from design audit — tool registry + execution engine)

### Single Plan Mode (No Separate Execute Mode) ✅ RESOLVED
- Decision: One mode — Plan Mode. User controls depth: approve immediately (quick) or iterate (deep).
- No mode toggle. No complexity-based routing. No separate code paths.
- Former "Execute Mode" is just Plan Mode with zero iterations.
- Updated in ProjectDescription.md.

### Complexity Scorer — Removed ✅ RESOLVED
- Decision: Remove entirely. Formerly a router between Discord chat and web Studio.
- Single Plan Mode eliminates the need for mode routing.
- Safety-relevant checks absorbed into Stage 1 validation.
- Advisory warnings replaced by visual clone + diff highlighting.

### Desired State + Diff Engine Architecture ✅ RESOLVED
- Decision: During planning, LLM modifies an in-memory desired state (forked from real bot cache).
- At approval, a diff engine compares desired vs real and generates minimal execution steps.
- LLM's tool calls are ephemeral edits to the desired state — not replayed at execution.
- Industry-standard pattern (matches Cursor Agent, Claude Code, Terraform).
- Updated in ProjectDescription.md.

### Unified Tool Interface ✅ RESOLVED
- Decision: One set of 14 tools. Each exports: Zod schema, `plan()` (called during planning loop), `execute()` (called by execution engine), and `getAssumptions()`.
- Same tools used for Plan Mode and execution — no separate "virtual tools" vs "Discord tools."
- `plan()` records intent and updates desired state during planning. `execute()` calls Discord API with resolved IDs.
- Updated in ProjectDescription.md.

### ask_user as ImmediateTool ✅ RESOLVED
- Decision: `ask_user` is the only ImmediateTool — executes during the planning loop (pauses, asks human, returns answer).
- All 13 other tools are DeferredTools — modify desired state during planning, execute later.
- Matches industry standard (Cursor, Claude Code, OpenAI function calling).
- Tool result: LLM receives `{ planned: true, symbol: "$x" }` for deferred tools, `{ answer: "..." }` for ask_user.
- Updated in ProjectDescription.md.

### Bot ADMINISTRATOR Requirement ✅ RESOLVED
- Decision: Bot MUST have ADMINISTRATOR. Check at startup per guild.
- Lacking ADMINISTRATOR → guild blocked, all API operations rejected with clear error.
- Simplifies permission model: ADMINISTRATOR bypasses all channel overwrites, bot can never be locked out.
- @everyone VIEW_CHANNEL denial becomes a WARNING (not block) — bot can still see everything.
- Updated in ProjectDescription.md.

### Guild-Level Concurrent Plan Locking ✅ RESOLVED
- Decision: `current_plan_id` column on `guilds` table. Simple lock.
- One plan executing per guild. Later plans re-validated after earlier plan completes.
- Updated in ProjectDescription.md.

### Limited Manual Edits ✅ RESOLVED
- Decision: Users can rename items, reorder channels/categories, delete proposed changes, edit role properties.
- Structural edits (moving channels between categories) are BLOCKED — require LLM revision.
- Manual edits do NOT trigger automatic LLM revision (cost saving).
- Each edit creates an iteration snapshot.
- Updated in ProjectDescription.md.

### Iteration History + Revert ✅ RESOLVED
- Decision: Each user prompt or manual edit creates a versioned iteration snapshot (desired state checkpoint).
- Users can view, revert to, or continue from any past iteration.
- Reverting creates a new iteration copying the old one's state — nothing deleted (git-like).
- Updated in ProjectDescription.md.

### Name Guidance (Soft Limit) ✅ RESOLVED
- Decision: System prompt includes soft guidance — channel names ≤25 chars, category/role names ≤20.
- Not a hard validation rule. Discord max is 100 chars.
- Preference only — LLM can exceed when clarity requires.
- Updated in ProjectDescription.md.

### Plan Optimizer (Delete+Create → Edit) ✅ RESOLVED
- Decision: At approval, before execution, optimizer detects delete+create pairs and converts to edits.
- Preserves message history and role assignments.
- Matching: same resource type, same parent/position, name similarity signal.
- Updated in ProjectDescription.md.

### Updated Validation Checklist ✅ RESOLVED
- Decision: Stage 1 checks organized into 5 ordered groups: Permissions → Dependencies → Constraints → Safety → Integrity.
- Full checklist in ProjectDescription.md Section 7.A.
- Updated in ProjectDescription.md.

### Retry Scope — Per-Step with Full Rollback ✅ RESOLVED
- Decision: Retry failed step up to 3 times (only that step). If permanently failing, roll back ALL completed steps.
- No partial state left on Discord server.
- User offered: Retry Plan or Revise.
- Updated in ProjectDescription.md.

---

## Still Open (To Be Resolved Later)

### 14. `ask_user` State Persistence
- When `ask_user` pauses the planning loop, the conversation state must be persisted (mid-loop).
- Server needs to resume the exact same conversation after user responds.
- Requires storing full messages array + loop state in DB.
- **Status: Design decided (conversation model handles this). Implementation needed.**

### 15. LLM Validation Error Recovery
- What if the LLM keeps making the same mistake? How many retries before aborting?
- **Status: 3 retries decided. Implementation needed.**

### 16. Revise Flow — Conversation Context
- When user clicks "Revise" with a new prompt: fresh loop with old desired state as context, or append?
- **Status: Append to existing conversation decided. Implementation needed.**

### 17. Diff Engine Matching Heuristics
- How does diff engine match items between desired state and real state?
- Existing items matched by Discord ID. New items matched by name + parent + type.
- Heuristic details (name similarity threshold, etc.) to be refined during implementation.

### 18. Plan Optimizer Heuristics
- Exact heuristics for detecting "delete + create = rename" patterns.
- Name similarity threshold, parent match requirements, step proximity.
- To be finalized during implementation with real Discord data.

---

## New Issues (from design audit)

### 19. `planData` JSONB Queryability
- Plan data stored as single JSONB column — opaque for queries.
- Cannot efficiently query "find all plans that touched channel X" from SQL.
- Mitigation: `results` array in plan contains created/modified/deleted Discord IDs.
- Do we need a separate join table for plan_resource_effects? Or is JSONB indexing sufficient?
- **Deferred to Phase 2.**

### 20. Desired State Sync on Gateway Events
- During a long planning session, real Discord state may change (other admins, manual changes).
- Should the desired state be re-forked from fresh real state? Or just warn on conflict at approval?
- **Deferred — pre-execution conflict check handles detection. Re-forking during planning = Phase 2.**

---

## Resolved

### Auth (Better Auth)

- Better Auth with Discord OAuth2 provider (self-hosted, open source, type-safe)
- Hono middleware validates session on every request
- Session stored as HTTP-only cookie on app domain
- User roles: super_admin, admin, user (multi-tenant via organizations feature)
- Permission check: user must have "Manage Server" in Discord
- Subscription tiers: free, pro, enterprise (feature flags per tier, deferred)

### Stack Decisions

- Frontend: Vite + React SPA (no SSR needed, no SEO for app)
- Landing + Docs: Astro SSG (SEO-optimized)
- Routing: React Router v6 (7 routes, nested layouts, standard API)
- State Management: Zustand (global UI state, splits into multiple stores if scope grows beyond ~30 slices)
- Data Fetching: Manual fetch via `fetch` API, stored in Zustand (~15 endpoints, no extra library needed)
- Backend: Hono + Node.js (co-located with Bot Worker)
- Bot: Discord.js v14 (same process as Hono)
- Database: PostgreSQL self-hosted (same machine as backend)
- ORM: Drizzle ORM
- Auth: Better Auth
- LLM: Vercel AI SDK + OpenRouter (model choice is runtime config — GPT-4o, Claude, Gemini, etc.)
- Real-time: SSE via hono/streaming (single persistent connection, instant updates)
- Tunnel: Cloudflare Tunnel
- Monorepo: pnpm workspaces (apps/web, apps/docs, apps/server, packages/shared, packages/db)
- Hosting: Web app on Cloudflare Pages/Vercel (free), backend on user's PC/VPS
- Dashboard scope reduced: plan history, rules CRUD, basic settings, basic stats. Full admin tool deferred.
- Backups: Deferred (not a Phase 1 concern)

### LLM Planning for Complex Scenarios

- Template-based planning for complex scenarios (e.g., gaming tournament)
- Templates encode expert knowledge: structure, questions, validation rules
- LLM matches intent → loads template → asks questions → fills template → generates tool calls
- If no template matches: LLM generates from scratch with extra questioning + validation

### Bot Cache vs. Logging

- Bot maintains in-memory cache of server state (channels, roles, permissions)
- Cache updated in real-time via Gateway events
- On restart: fetch full state from Discord API, rebuild cache
- PostgreSQL stores only: plans, snapshots (captured from cache), rules, user data
- Snapshots are for history/rollback, not continuous state tracking
- Bot and Hono API run in same process — cache is directly accessible from API

### Plan Assumptions

- Each tool declares what assumptions it makes (name conflicts, parent existence, bot permissions)
- System collects all assumptions from all steps, deduplicates, stores in plan
- Pre-execution checks each assumption against fresh Discord state
- If assumption fails: report conflict, ask user how to proceed

### Clarifying Questions

- LLM can ask user for clarification using `ask_user` tool
- Prevents guessing on vague intents
- Example: "Set up security" → LLM asks "What kind? [Role-based / Anti-raid / Content filtering / All]"

### Expert Validation Layer

- Two-part: structural checks (code) + completeness suggestions (LLM)
- Catches omissions (e.g., "You have team channels but no team roles")
- LLM suggestions are optional, shown as "Did you forget...?" not blocks

### Template vs. Symbolic References

- Templates use variables (e.g., `{{team_count}}`) as parameters filled at apply time
- LLM planning uses symbolic references (e.g., `$channel_staff`) as step outputs resolved at execution time
- These are different concepts, now clearly separated

### Scoring Thresholds ❌ OBSOLETE
- Complexity scorer removed. Single Plan Mode eliminates need for complexity-based routing.
- Remaining safety checks absorbed into Stage 1 validation.
- Updated in ProjectDescription.md.

### Server State Representation

- Dual format: JSON for system, structured text for LLM context
- Permission notation: +view,+send = allow, -view = deny
- Summarization done by code, not LLM

### Channel Preservation

- Classification: IMPORTANT / MODERATE / LOW (computed by code)
- Manual tagging: user can mark channels as Important or Expendable
- LLM constraint: prefer rename/move over delete+create for channels with activity
- Primary channel detection: auto-detect + user confirmation

### Error Handling

- Retry up to 3 times for transient errors
- Hardcoded fix map for known errors (403, 429, 404, 500)
- LLM fallback for unknown errors
- Full rollback on unfixable errors
- Rollback recreates structure even if content lost

### Snapshot Storage

- Types: execution_before, execution_after, role_deletion, plan_state
- Role deletion snapshots: member list stored, 1-month TTL
- Cleanup: daily scheduled job

### Template System

- Storage: JSONB in PostgreSQL with metadata
- Library: browse by tags, search, detail page (read-only), "Add to Studio"
- Customization: happens in Studio only (single editing surface)
- Retrieval: keyword/tag match first, LLM semantic match fallback
- Diff engine: code-based comparison (add/update/merge/keep tags)

### First-Time Setup

- Web-only, bot sends link
- Guided wizard: server scope, rules (optional), template selection
- After setup: suggest problem scan
- No Discord chat setup

### Studio + Dashboard

- Studio: visual server design workspace (Discord clone config UI), client-side SPA
- Dashboard: reduced scope — plan history, rules CRUD, basic settings, basic stats
- Dashboard is supplementary — Studio is the primary interface
- Plan preview: two-panel layout (text summary + Discord clone visualization)
- State management: Zustand (Studio UI state), TanStack Query (data fetching)
- Full admin management tool, billing, detailed audit logs deferred

### Problem Scanner

- Triggered via `/scan` slash command or suggested after setup
- Combines deterministic checks + LLM semantic checks
- Results stored for tracking

### Revision Tools

- Revise Server: AI scans current state, suggests improvements
- Revise Using Template: diff engine compares template vs server, LLM generates merge plan

### ask_user Tool

- Multiple choice options
- Option for user to add their own choice
- No image upload
