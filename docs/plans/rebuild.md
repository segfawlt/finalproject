# Rebuild-from-Scratch Plan

Status: agreed, ready for implementation in a new session/repo.
Author context: solo dev, near-beginner in JS/TS, 1 month full-time budget (~170h), goal is to be able to defend authorship of the system's core in a viva.

## Why this doc exists

This repo (`FinalTestProject`) is the AI-generated reference implementation. The
user will rebuild the core of the system, by hand, with AI help, in a **separate
new repository**, using this repo as:

- an architectural reference (layer order, contracts, interfaces)
- a source of existing tests, copied forward as **draft specs, not ground truth**
  (the user does not fully trust LLM-generated tests — they may encode wrong
  assumptions alongside the code they were written against)
- a place to `grep` for answers while working in the new repo

The new repo does not import this one. Shared types/constants get copied in, not
imported, since there's no shared workspace across repos.

## Goal

Prove authorship of the algorithmic core: state model, diff engine, validation,
execution engine. Frontend, DB wiring, boilerplate, and (time permitting) the
Discord bot itself are AI-generated and explicitly labeled as such. This is a
defensible, normal claim — the plan-first architecture's whole design point is
that the core is pure, framework-free logic sitting behind thin interfaces
(`ExecuteContext`, the tool registry). That's exactly the part a beginner *can*
own in a month, and exactly the part a viva will probe.

## Method (applies to every layer)

Three passes, in order, per layer:

1. **Contract** — before any code, write in prose: what goes in, what comes out,
   what invariant this layer guarantees. Produced **per-layer, just-in-time**:
   right before starting a layer, its contract brief covers that layer plus
   whatever lower layers it depends on (learned in context, not as abstract
   up-front prep).
2. **Skeleton** — write signatures only. Pull over that layer's existing test
   file from the reference repo. Read the tests critically — flag any assertion
   that looks wrong or that contradicts the design docs, before trying to satisfy
   it. Disagreements get written down; they are report material, not noise.
3. **Implement** — function by function, red → green. Rule: never write a line
   whose purpose can't be stated out loud. If it can't be stated, stop and ask
   before continuing.

## Layer order (bottom-up, dependency order — not "importance order")

```
L0  types                     ServerState, DesiredState, PlanStep, SymbolTable
L1  constants                 permission names, channel type map
L2  desired-state-store       mutation + validation + symbol generation
L3  fork                      ServerState -> DesiredState
L4  tools                     plan()/execute() pairs, registry
L5  diff-engine               DesiredState + ServerState -> PlanStep[]
L6  validation                PlanStep[] -> issues (Group B only, see below)
L7  ExecuteContext            the boundary interface (+ 13th method, see below)
L8  execution-engine          PlanStep[] + ctx -> results, retry, rollback
─── everything above is core; below is AI-generated territory ───
L9  planning-session (LLM loop), Hono routes, DB, React, Discord bot
```

Confirmed by a fresh reference-repo scan: L0–L4 in the reference are already
clean — pure types/functions, zero imports of `discord.js`/`@repo/db`/logger, no
upward dependencies. Rebuilding L0–L4 bottom-up has no known obstacles.

## Per-layer plan

### L0 — types

Read-cold from reference (`packages/shared/src/types.ts`), copy over. No changes
needed — confirmed sufficient for every downstream consumer checked so far
(`PlanStep`, `SymbolTable`, `DesiredState` all already carry what L5/L6/L8 need;
see "Foundational decisions locked" below).

### L1 — constants

Read-cold, copy over (`DISCORD_PERMISSIONS`, channel type map). No logic.

### L2 — desired-state-store — OWN, write yourself

~400 lines. Pure class, in-memory Maps, JSON clone/revert, symbol generation
(`nextSymbol`), CRUD (`addChannel`/`editChannel`/`removeChannel`/...), reference
validation. Zero dependencies beyond L0 types. Start here — safest layer, no
mocks, existing test suite (`desired-state-store.test.ts` +
`desired-state-store-member.test.ts`) runs standalone with zero setup.

### L3 — fork — OWN, write yourself

~80 lines. `ServerState -> DesiredState`. Where the "declarative, not imperative"
architecture begins: current real state becomes an editable draft. Small, cheap,
conceptually important — worth writing by hand even though it's short.

### L4 — tools — MIXED, 3 hand-written, 14 AI-generated

All 17 tools share one contract: Zod schema, `plan()`, `execute(ctx)`. Hand-write
3, covering the 3 distinct shapes in the set:

| Tool | Shape taught |
|---|---|
| `create_channel` | create-with-deps: parent_id symbol ref, type-conditional fields |
| `edit_role` or `move_role` | hierarchy-sensitive: position, ties directly into Group B's bot-above-target check |
| `set_overwrite` | symmetric diff: allow/deny arrays, feeds Group D overwrite-consolidation |

AI-generates the remaining 14 (`delete_channel`, `move_channel`,
`create_category`, `edit_category`, `delete_category`, `create_role`,
`delete_role`, `remove_overwrite`, `batch_set_overwrite`,
`add_role_to_member`, `remove_role_from_member`, `ask_user`, and 2 more
edit/create variants). Defensible in one sentence: same contract, more entity
types, already demonstrated by hand on the 3 above.

### L5 — diff-engine — OWN (partial), write yourself

~700 lines in reference, cut to ~500 owned. Write:

- the algorithmic spine: `buildSymbolTable`, `buildDependencies`,
  `topologicalSort` (Kahn's algorithm, cycle detection), `mergeEdits`,
  `removeNoOps`
- 3 of 6 step generators: `generateChannelSteps`, `generateRoleSteps`,
  `generateOverwriteSteps` (the three "hard" ones — parent deps, position/
  hierarchy, symmetric overwrite diff)

AI-generates: `generateCategorySteps`, `generateMemberRoleSteps`,
`generateTombstoneSteps` (same pattern, simpler entity types).

**Known reference bug, do not carry over**: `diff-engine.ts` imports the pino
`logger` singleton — the one non-pure edge in an otherwise pure layer. Don't
import a logger in the rebuild; keep L5 a pure function of its two arguments.

Existing test file (`diff-engine.test.ts`, 16 tests) runs standalone, zero
mocks — confirmed by running it. Good spec to pull forward, but see "test
skepticism" note above — read each test in light of the design docs before
treating it as correct, especially around member-role diffing (see the
`memberRoles` gap noted below).

### L6 — validation — OWN Group B only, rest AI-generated

Full picture, groups A–E (from `docs/design/validation-and-safety.md`, Stage 1
is fully implemented in the reference):

| Group | What | Own? |
|---|---|---|
| A Permissions | perm names valid, bot ADMINISTRATOR, bot role strictly above targeted roles | AI-generated |
| **B Dependencies** | symbols resolve, symbol-type match, no cycles (Kahn's), DAG sortable, dependency indices in range | **OWN** — reuses your L5 symbol table directly |
| C Resource | no dup names/member-role ops, category ≤50 children, topic/bitrate type constraints | AI-generated |
| D Safety | no ADMINISTRATOR grant to new roles, rate-limit estimate, overwrite-consolidation warn | AI-generated, extend (see below) |
| E Integrity | plan has ≥1 step, status draft/validated | AI-generated |

Confirmed (foundational review): `PlanStep` already carries everything Group B
reads (`params`, `dependsOn`, `SymbolEntry.type`) — no type change needed to
build B in isolation.

**Known reference bug, fix by construction in rebuild**: in the reference,
`validation.ts` imports `@repo/db`, `../bot/permissions`, `../bot/cache`, and
eager `validatedEnv` directly — making it untestable in isolation (confirmed:
`validation.test.ts` throws at import, `DATABASE_URL not set`, even with mocks
in place, because the crash happens one import earlier). **Rebuild rule: pass
bot-permission facts, cache snapshot, and server rules into `validatePlan` as
plain-data parameters. Never import the modules that own them.** This is a
straightforward win in the new repo — there's no legacy call site forcing the
old pattern.

**New in scope — safety-guard extensions (Group D), both approved:**

1. **Hardcoded dangerous-permission-combo check** (cheap, deterministic, Group D
   addition): block or warn on new-role permission combinations that are
   near-admin without tripping the existing ADMINISTRATOR-grant check — e.g.
   `MANAGE_ROLES` + `MANAGE_CHANNELS` together on a single new role.
2. **LLM judge pass ("Stage 2.5")** — a separate, narrow-scope LLM call, prompt
   only, no schema beyond a structured verdict: given the plan, identify which
   sections (which categories/roles) look risky enough to flag for explicit
   human attention, independent of the Stage 2 rules check. Studio UI gets a
   marker/badge on flagged sections. This mirrors how coding-agent bash
   classifiers gate dangerous commands. In scope now, not deferred — but small:
   it's a prompt + a verdict shape + a UI badge, not a new subsystem.

**Stage 2 (server-rule enforcement) — the real gap, close it in the rebuild:**

- Reference today: rules enforced only at **execution time**
  (`validateWithLLM`, fail-closed on missing key/load failure/provider
  error/timeout/malformed response). Planner never sees the rules.
- Intended and agreed fix: inject `guildRules` into the planning system prompt,
  same pattern the reference already uses for `activeTemplates`
  (`planning-session.ts`, the two loops around lines 615/625 — `activeTemplates`
  is the template to copy). Add explicit instruction: "check the plan against
  each rule below before finalizing, note compliance." Text-only, no schema.
- Execution-time Stage 2 check stays as the fail-closed backstop regardless —
  planning-time injection reduces how often it fires, doesn't replace it.

### L7 — ExecuteContext — OWN, the boundary interface

12 methods in the reference (`createChannel`, `editChannel`, `deleteChannel`,
`moveChannel`, `createRole`, `editRole`, `deleteRole`, `moveRole`,
`setOverwrite`, `removeOverwrite`, `addRoleToMember`, `removeRoleFromMember`),
all plain string/number/object params and returns — zero Discord.js types in
the interface itself. Confirmed 100% parameter-injected in the reference (no
singleton), so the same pattern is copyable directly.

**Add a 13th method that the reference doesn't have**:
`getCurrentServerState(guildId): Promise<ServerState>`.

Why: in the reference, `rollbackFull` calls a free function
`buildCurrentStateFromDiscord` that bypasses `ExecuteContext` entirely and
reaches `botClient` directly — a confirmed boundary hole. Confirmed by
foundational review: a 13th interface method fully replaces that function
(single-guild scope matches exactly; nothing it does needs data beyond one
guild). This is a real, evidence-based improvement over the reference
architecture, not a guess — worth stating as such in the report.

**Known reference bug, must fix, not just relocate**: the reference's
`buildCurrentStateFromDiscord` never populates `ServerState.memberRoles`. Diff
engine treats a missing `memberRoles` as an empty set, so rollback can re-add
member-roles from the before-snapshot, but **cannot detect or undo member-role
additions made during the failed execution** — nothing on the "real" side to
diff against. This is undocumented in the reference. The new
`getCurrentServerState` method must populate `memberRoles` correctly, or the
bug just moves into the rebuild instead of getting fixed.

Then write `InMemoryExecuteContext` (~150-220 line estimate from prior scan):
Maps for channels/roles/overwrites/members, id counter, throw-on-not-found,
implementing all 13 methods with real stateful semantics (not just spies).
Existing reference tests (`channels.test.ts`) already show the full 12-method
shape as `vi.fn()` stubs — same shape, replace stubs with real Map-backed logic.

This unblocks a full plan -> execute -> rollback demo with **no Discord
dependency at all**.

### L8 — execution-engine — OWN, write yourself

~650 lines. Build in two passes, matching the agreed "happy path first" order:

**Pass 1 — happy path only** (build first, assume every step succeeds, nothing
external changes):
- `resolveSymbols`
- `dispatchStep` — resolve symbols in a step's params, call the matching
  `ctx.method(...)`, record result
- `executePlan` — topological-order loop over steps, calling `dispatchStep`,
  streaming results

**Pass 2 — fail flow** (deferred, added as extra branches around the same loop,
not a redesign):
- error classification: transient (retry, exponential backoff + jitter, cap 3)
  vs. known (hardcoded diagnosis) vs. unknown (fail immediately, no LLM
  involved in diagnosing execution errors)
- `rollbackFull` — before-snapshot taken up front, on permanent failure: fork
  the before-snapshot, call `ctx.getCurrentServerState`, re-run the diff engine
  to compute the **reverse diff**, execute that as an ordinary plan. Not
  step-inversion — recomputed from live reality, so it's robust to anything
  else that changed mid-execution too. This is the strongest design story in
  the system; worth the effort once Pass 1 is solid.

**Pass 3 — stale flow** (deferred further, doesn't touch the L5-L8 core; see
"deferred, on purpose" below).

Relevant reference learnings to apply here (from `docs/learnings/`):
- `error-subclass-vs-message-matching-for-retry-classification` — retry
  classification design pattern.
- `promise-race-for-uncancellable-api` — Discord's API has no cancellation
  hook; use `Promise.race` against a deadline, understand you're racing your
  *wait*, not cancelling the underlying call.
- `between-step-abort-check-doesnt-bound-hung-call` — an abort flag polled
  only between steps can't stop work already in flight inside one step.
- `discord-role-diff-must-respect-hierarchy` — direct hit for both L5's
  `generateRoleSteps` and L6 Group B/A hierarchy checks.
- `distinguish-absent-policy-from-unavailable-validation` — direct hit if
  extending Stage 2's fail-closed logic (skip only when no policy exists; block
  when policy exists but can't be evaluated).

### L9 — everything else — AI-generated, read-cold only

`planning-session.ts` (LLM tool-calling loop, `maxTurns` guard — see below),
Hono routes, DB schema/migrations, React/Zustand frontend, Discord bot
(`bot/client.ts`, `bot/execute-context.ts`, gateway event handling). Read enough
to explain in one sentence each; do not attempt to author.

## Deferred, on purpose (explicit, revisit after L8 Pass 1)

- **Fail flow** (L8 Pass 2) and **stale flow** (forkStateHash mismatch,
  `/replan` recovery) are deferred until the happy-path core (Pass 1) works
  end-to-end. This is architecturally safe: both are additive wrappers around
  the same dispatch loop / a separate pre-execution check + endpoint, not a
  core redesign. Confirmed no ripple risk to L0-L7 shapes.
- **planning-session.ts** (the LLM loop itself) — "mine if time allows," lowest
  priority, budgeted as a stretch goal only after L0-L8 core is done.
- **Real Discord bot** — build last, or skip entirely if time runs out. The
  `InMemoryExecuteContext` (L7) makes the full plan/execute/rollback flow
  demoable without it.

## `maxTurns` cap — decision, not changed

Reference caps the planning loop (one LLM call = one turn) at 20
(`while (status === "planning" && maxTurns-- > 0)`). Agreed: keep 20 as a
**hard-coded safety net**, not the primary way to control plan size. Push large
modifications toward multiple smaller conversation turns instead of one giant
single-shot plan — smaller plans are easier for a human to review at approval,
which matches the "plan-first, never blind" principle already in this
project's CLAUDE.md. The cap is not, and cannot be, adjusted via system
prompt — it's a code-side loop guard. System prompt can only nudge the LLM
toward preferring smaller, focused tool-call batches, which indirectly reduces
how often the cap is even approached. Do not raise the number pre-emptively;
only revisit if real usage shows plans getting truncated.

## Foundational decisions locked (from design review, no open risk)

Confirmed by explicit review against reference code + design docs before any
implementation starts, so none of these should force a backward change later:

1. `PlanStep` already carries everything Group B validation reads (`params`,
   `dependsOn`, `SymbolEntry.type`). No type change needed.
2. `ExecuteContext` needs exactly one addition — `getCurrentServerState` — to
   fully replace the reference's `buildCurrentStateFromDiscord` boundary hole.
   Confirmed no other Discord-specific data is needed beyond single-guild scope.
3. One `SymbolTable` shape (`{ symbol, type, definingStepIndex,
   resolvedDiscordId? }`) serves both L5's dependency graph
   (`definingStepIndex`) and L6's symbol-type matching (`type`) with no gap.
   `resolvedDiscordId` is written later by L8, read by neither L5 nor L6.

## Drift/bugs found in the reference repo during review (do not carry over)

1. `overview.md` says 14 tools; actual registry has 17 (matches
   `planning-and-execution.md`). Doc-only drift in the reference, irrelevant to
   the rebuild except as a reminder to keep the new repo's own docs in sync as
   code changes (per this project's existing "Keep Docs In Sync" convention).
2. `rollbackFull` bypasses `ExecuteContext`, hits `botClient` directly — fixed
   in the rebuild via the L7 13th method, see above.
3. `buildCurrentStateFromDiscord` never populates `ServerState.memberRoles` —
   silent gap in rollback's member-role handling — fixed in the rebuild by
   making `getCurrentServerState` populate it correctly, see L7 above.
4. `validation.ts` imports live DB/Discord/env modules directly, making it
   untestable in isolation (confirmed: test file's own mocks don't help because
   `env-validated.ts` throws at import time, one level up). Fixed in the
   rebuild by passing facts as parameters instead of importing owning modules,
   see L6 above.
5. `env-validated.ts`, `bot/client.ts`, `auth/config.ts`, and
   `hono/middleware/rate-limit.ts` all run real work at **module import time**
   (eager env validation that throws, real discord.js Client construction, real
   `betterAuth(...)` + DB adapter construction, an un-gated `setInterval`).
   None of these are part of the OWN core, but worth avoiding by habit in L9
   AI-generated code in the new repo: prefer lazy factories
   (`getX()`/`createX()`) called once at bootstrap, never eager top-level
   `export const x = expensiveThing()`.

## New-repo documentation (own item, separate from the report)

Once the new repo is initialized, create its own `IMPLEMENTATION_STATUS.md`
(mirroring this repo's format: done/partial/placeholder/gap per subsystem) and
a short plan doc, updated as each layer lands — not the academic report, a
working engineering doc for the new repo itself.

## Report

The user is not writing the report from scratch — they'll revise/modify the
existing draft chapters based on final rebuilt-system work, later, in a
separate pass. Not part of this implementation plan.

## Summary — lines owned, budget check

| Layer | Item | Approx. lines owned |
|---|---|---|
| L2 | desired-state-store | 400 |
| L3 | fork | 80 |
| L4 | 3 tools | 150 |
| L5 | diff-engine (cut) | 500 |
| L6 | validation Group B (+ D extensions, small) | ~150-200 |
| L7 | ExecuteContext + InMemoryExecuteContext | 200 |
| L8 | execution-engine Pass 1 (+ Pass 2 if time) | 650 |
| **Total core** | | **~2100-2200** |

Against ~170h (1 month full-time), including ~1 week of JS/TS/async fundamentals
up front. Tight, achievable if scope holds to this doc. Cut list if behind
schedule, in order: L8 Pass 2 (fail/rollback) first, then stale flow (already
deferred), then Group D extensions, then reduce L5 to spine-only (drop one of
the 3 hand-written generators, prefer keeping overwrite/role over channel if
forced to choose one).
