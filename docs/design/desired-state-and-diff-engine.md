# Desired State & Diff Engine

## Overview

Two tightly coupled subsystems that form the core execution pipeline:

```
PLANNING STAGE              APPROVAL STAGE            EXECUTION STAGE
┌──────────────┐              ┌──────────────┐            ┌──────────────┐
│ DesiredState │  ──────────▶ │ Diff Engine  │ ────────▶ │ Symbol       │
│ (LLM edits)  │  snapshot   │ (dumb,       │  steps   │ Resolver +   │
│              │             │  deterministic│          │ Discord API  │
└──────────────┘              └──────────────┘            └──────────────┘
```

> **Phase mapping:** This document describes the **3-stage pipeline** (technical implementation).
> These map to the 6-phase user flow in [overview.md](./overview.md#the-6-phase-flow):
>
> | 3-Stage Pipeline | 6-Phase User Flow                        |
> | ---------------- | ---------------------------------------- |
> | Planning Phase   | Phase 2 (Planning) + Phase 3 (Iteration) |
> | Approval Phase   | Phase 4 (Approval)                       |
> | Execution Phase  | Phase 5 (Execution)                      |
>
> Post-Execution (Phase 6) is outside this pipeline — it runs after execution completes.

---

## DesiredState Data Model

The DesiredState is an in-memory structure modified by LLM tool calls during planning. It is NOT a pure snapshot — it carries explicit metadata about what was created and deleted.

### Structure

```
DesiredState {
  guildId: string
  guildName: string

  active: {                    // items that should exist after execution
    channels: Record<string, Channel>       // categories live here too (type 4)
    roles: Record<string, Role>
    overwrites: Record<string, Overwrite>
    memberRoles?: Record<string, MemberRoleAssignment>  // per-member role sets
  }

  tombstones: [                // items explicitly deleted during planning
    {
      discordId: string         // real Discord ID of deleted item
      resourceType: "channel" | "role" | "category"
      name: string              // name at time of deletion
      deletedInVersion: number
    }
  ]

  symbolCounter: number         // for generating $ch_0, $ch_1, $role_0...
  version: number               // iteration version, matches plan_iterations.version
}
```

### Key invariants

1. **Every deletion creates a tombstone** (channels, categories, and roles). When the LLM calls `delete_channel`, the item moves from `active` to `tombstones`. It is never silently removed. Categories live in the `channels` map (`type: 4`); deleting one records a tombstone with `resourceType: "category"`.

2. **Overwrites use symmetric diffing** — no tombstones. Overwrites are simple composite-key entries with no hierarchy or audit-trail value. The diff engine scans real-state overwrites absent from desired state and emits `remove_overwrite` steps. `removeOverwrite` deletes from active directly; the diff engine handles the Discord side.

3. **Existing items keep their Discord ID.** The `id` field in active items is the real Discord ID for existing resources. New items get a symbol (`$ch_0`).

4. **Symbols are assigned on creation.** When the LLM calls `create_channel`, the system assigns a symbol and adds the item to `active`.

5. **No item appears in `active` without either a Discord ID or a symbol.** This gives the diff engine a clear discriminator.

### Why tombstones? (channels, categories, roles)

Without tombstones, the diff engine must SCAN real state for items missing from desired state — inferring deletions from absence. This is fragile:

- A bug in the fork logic could silently schedule deletions
- A missed Gateway event could look like an intentional deletion
- There's no audit trail for what was deleted or why

With tombstones:

- Deletions are explicit, recorded facts
- The diff engine reads a list, doesn't guess
- If an item is missing from `active` but has no tombstone → VALIDATION ERROR (plan blocked)
- Tombstones power the approval UI: they are the "deletions" column shown alongside "creations" so the user can visually compare and catch unintended delete+create patterns

Tombstones are data, not logic. They record what happened during planning. The system presents them — the human judges them.

### Why symmetric diffing for overwrites?

Overwrites are structurally simpler than channels/roles:

- No hierarchy (no parent-child relationships)
- No audit value (no message counts, no member counts)
- Keyed by composite `channelId:roleId` — deterministic identity
- The approval UI doesn't show overwrites in the deletions/creations comparison

Symmetric diffing (scan real for absent → delete) is simpler, faster, and doesn't require a tombstone mechanism for a resource type that gains nothing from it. The invariant "every deletion creates a tombstone" applies to channels, categories, and roles — not overwrites and not member roles (member role removals are also diffed symmetrically; see below).

---

## The 4-Layer Prevention Stack

Before we reach the diff engine, multiple layers handle the delete+create problem:

```
                    ┌─────────────────────────────────────┐
   LAYER 1          │  Tool design: give the LLM the      │
   (prevention)     │  RIGHT tools. edit ≠ delete+create  │
                    │                                     │
                    │  edit_channel exists. If the LLM    │
                    │  wants to rename, it uses it.       │
                    ├─────────────────────────────────────┤
   LAYER 2          │  LLM system prompt: strong guidance │
   (guidance)       │  "Use edit_* to rename. Only use    │
                    │   delete+create when you want to    │
                    │   destroy and replace a resource."   │
                    ├─────────────────────────────────────┤
   LAYER 3          │  Approval UI: present, don't judge  │
   (safety net)     │  Show deletions (tombstones) and    │
                    │  creations (symbols) side by side.  │
                    │  Always show message count for       │
                    │  deleted text channels.             │
                    │                                     │
                    │  No heuristics. No scoring. No      │
                    │  thresholds. The human compares     │
                    │  and decides.                       │
                    ├─────────────────────────────────────┤
   LAYER 4          │  Diff engine: dumb & deterministic  │
   (execution)      │  Executes exactly what's specified. │
                    │  No heuristics. No scoring. No      │
                    │  guessing.                          │
                    └─────────────────────────────────────┘
```

**Layer 1 is the real fix.** If the right tools exist and the system prompt guides the LLM correctly, 95% of the problem disappears.

**Layer 3 is the safety net for the remaining 5%.** Instead of algorithmic heuristics (which are brittle, require tuning thresholds, and produce false positives), the approval UI simply presents the facts:

```
  DELETIONS                    CREATIONS
  #general — 12,847 msgs       #announcements (text, in Info)
  #old-chat — 3 msgs           #team-chat (text, in Info)
```

The juxtaposition of deletions and creations, plus the message count for each deleted channel, gives the user everything they need to spot a mistaken delete+create pattern. The system presents facts — the human judges them.

Message count is always shown for deleted text channels (no configurable threshold). A single number is all the user needs to assess deletion impact. The cost is one `<span>` in the UI.

**Layer 4 does NOT auto-convert.** The diff engine never guesses whether a delete+create pair "was really a rename." It executes what's specified, and Layer 3 already gave the user a chance to catch it.

---

## Rejected Approaches

These were considered and explicitly rejected:

### Content hashing for change detection

Hashing a resource's properties into a fingerprint (`hash({name, type, parentId, ...})`) and comparing fingerprints to detect changes. Rejected because:

- The hash almost never skips work (if the LLM put the item in the plan, something probably changed)
- It's just field-by-field comparison with extra steps — no real performance or correctness win
- The only useful concept is the **canonical fingerprint** (which properties define a resource's identity for diffing), but the hash on top adds nothing

### Scoring-based rename detection

Using weighted heuristics (name similarity, same category, same type, permission overlap) to algorithmically detect delete+create rename patterns. Rejected because:

- Every signal is noisy in isolation (e.g., "same category" is common even for unrelated changes)
- Weights and thresholds must be tuned per server — no single configuration works everywhere
- Produces both false positives (warning on intentional replace) and false negatives (missing a rename in a different category)
- Becomes a maintenance burden: every Discord API change risks breaking the scoring heuristic
- The user looking at the before/after in the Studio is the only reliable rename detector — no algorithm can beat human judgment for assessing intent

### Configurable message count thresholds

Letting users set a threshold for when to flag deletion message counts as "high." Rejected because:

- No single number works across all servers (100 msgs is a lot for a friend server, noise for a large public server)
- The cost of always showing the number is a single `<span>` — hiding it requires extra config UI, extra state, extra edge cases
- Showing the count unconditionally gives the user all the signal they need, with zero configuration

---

## Diff Engine

### Design principle: dumb and deterministic

The diff engine is a pure function: `(RealState, DesiredState) → ExecutionSteps`.

It does not:

- Use heuristics to detect rename patterns
- Score items for matching
- Auto-convert delete+create to edit
- Make any decisions

It does:

- Read explicit state (active items, tombstones, symbols)
- Generate the corresponding Discord API steps
- Sort topologically
- Remove no-ops

### Algorithm

```
diff(realState, desiredState):

  PHASE 1: GENERATE RAW STEPS

    For each item in desiredState.active:
      ┌─ Has Discord ID → EXISTING
      │   Match by ID in realState
      │   If found and different → edit_* step
      │   If found and same → skip
      │   If NOT found in realState → ERROR (deleted externally, catch in validation)
      │
      └─ Has symbol ($ch_N, $role_N) → NEW
          → create_* step (params contain symbol)

      Note: an existing category that only changed position still emits
      edit_category (not move_channel). move_channel is for real channels only.

    For each overwrite in desiredState.active.overwrites:
      ┌─ Contains symbol → NEW overwrite → set_overwrite step
      │   (depends on the symbols it references)
      │
      └─ All Discord IDs → EXISTING overwrite
          Match by composite key (channelId:roleId) in realState
          If found and different → set_overwrite step
          If not found in realState → set_overwrite (create new)
          If match → skip

      Skip rule: if the overwrite's channel is an existing channel with
      lockPermissions === true, skip its set_overwrite steps entirely —
      the parent category's overwrites propagate to synced children.

    For each real overwrite NOT in desiredState.active.overwrites:
      → remove_overwrite step (symmetric diffing — absence = deletion)

    For each member in desiredState.active.memberRoles:
      Symmetric diff the member's role set against real state:
      → add_role_to_member step for each role gained
      → remove_role_from_member step for each role lost
      (role refs may be symbols — resolved during execution)

    For each tombstone in desiredState.tombstones:
      → delete_* step (uses tombstone.discordId; delete_category for categories)

  PHASE 2: TOPOLOGICAL SORT

    Build dependency graph:
      create_channel(parent: $cat_0)  → depends on step that creates $cat_0
      set_overwrite(ch: $ch_0, ...)   → depends on steps creating $ch_0 and referenced role
      delete_category(id)             → all children must be dealt with first

    Default order (TOOL_ORDER, defined in diff-engine.ts):
      1.  create_category        (parents first)
      2.  create_channel
      3.  create_role
      4.  edit_category           (renames, repositions)
      5.  edit_channel
      6.  edit_role
      7.  move_channel            (change parent)
      8.  move_role               (change position)
      9.  add_role_to_member      (after role creation, before overwrites)
      10. remove_role_from_member
      11. set_overwrite           (depends on channel + role)
      12. remove_overwrite
      13. delete_channel          (children before parent category)
      14. delete_role
      15. delete_category         (last — all children handled)

    Post-sort: resolveDanglingSymbols name-matches any symbol-like
    reference that points at a pre-existing resource (not created in this
    plan) back to its real Discord ID before execution.

  PHASE 3: OPTIMIZE

    Pass 1: Merge edits to the same Discord ID
      edit_channel("123", { name: "x" }) + edit_channel("123", { position: 3 })
      → edit_channel("123", { name: "x", position: 3 })

    Pass 2: Remove no-ops
      edit_channel("123", {})  →  remove step entirely

  OUTPUT:
    ExecutionStep[] {
      index, toolName,
      params (may contain symbols),
      dependsOn (step indices),
      status: "pending"
    }
    SymbolTable {
      "$ch_0": { symbol, type: "channel", definingStepIndex: 2, resolvedDiscordId: undefined }
      ...
    }
```

### Edge cases

| Case                                                        | Handling                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Item in active with Discord ID, but missing from real state | Structured `missing_resource` conflict. Block execution; user may start AI re-planning from fresh state.                                                                                                                                                                                                                                                                                                                                              |
| Item missing from active, no tombstone                      | Validation error — bug or data corruption. Block plan.                                                                                                                                                                                                                                                                                                                                                                                                |
| Two active items claim same position                        | Assign sequential positions in execution order                                                                                                                                                                                                                                                                                                                                                                                                        |
| External changes during long planning session               | Pre-execution validation re-checks assumptions against fresh Discord state and compares the original fork point against current real state. If items touched by the plan were externally modified, the conflict blocks execution. The user must re-plan from fresh state: the DesiredState is re-forked, the LLM receives the conflict summary + fresh state + conversation history, and adapts the plan in-place (same conversation, new iteration). |
