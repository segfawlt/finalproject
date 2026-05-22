# Desired State & Diff Engine

## Overview

Two tightly coupled subsystems that form the core execution pipeline:

```
PLANNING PHASE                APPROVAL PHASE              EXECUTION PHASE
┌──────────────┐              ┌──────────────┐            ┌──────────────┐
│ DesiredState │  ──────────▶ │ Diff Engine  │ ────────▶ │ Symbol       │
│ (LLM edits)  │  snapshot   │ (dumb,       │  steps   │ Resolver +   │
│              │             │  deterministic│          │ Discord API  │
└──────────────┘              └──────────────┘            └──────────────┘
```

---

## DesiredState Data Model

The DesiredState is an in-memory structure modified by LLM tool calls during planning. It is NOT a pure snapshot — it carries explicit metadata about what was created and deleted.

### Structure

```
DesiredState {
  guildId: string
  guildName: string

  active: {                    // items that should exist after execution
    channels: Map<id, Channel>
    roles: Map<id, Role>
    overwrites: Map<compositeKey, Overwrite>
  }

  tombstones: [                // items explicitly deleted during planning
    {
      discordId: string         // real Discord ID of deleted item
      resourceType: "channel" | "role" | "category"
      name: string              // name at time of deletion
      deletedInIteration: number
    }
  ]

  symbolCounter: number         // for generating $ch_0, $ch_1, $role_0...
  currentIteration: number
}
```

### Key invariants

1. **Every deletion creates a tombstone.** When the LLM calls `delete_channel`, the item moves from `active` to `tombstones`. It is never silently removed.

2. **Existing items keep their Discord ID.** The `id` field in active items is the real Discord ID for existing resources. New items get a symbol (`$ch_0`).

3. **Symbols are assigned on creation.** When the LLM calls `create_channel`, the system assigns a symbol and adds the item to `active`.

4. **No item appears in `active` without either a Discord ID or a symbol.** This gives the diff engine a clear discriminator.

### Why tombstones?

Without tombstones, the diff engine must SCAN real state for items missing from desired state — inferring deletions from absence. This is fragile:

- A bug in the fork logic could silently schedule deletions
- A missed Gateway event could look like an intentional deletion
- There's no audit trail for what was deleted or why

With tombstones:
- Deletions are explicit, recorded facts
- The diff engine reads a list, doesn't guess
- If an item is missing from `active` but has no tombstone → VALIDATION ERROR (plan blocked)

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
   LAYER 3          │  User warning at approval           │
   (safety net)     │  If delete+create pair exists in    │
                    │  same category with same type:      │
                    │  "⚠ You are deleting #X and making  │
                    │   #Y in the same place. Rename?"     │
                    ├─────────────────────────────────────┤
   LAYER 4          │  Diff engine: dumb & deterministic  │
   (execution)      │  Executes exactly what's specified. │
                    │  No heuristics. No scoring. No      │
                    │  guessing.                          │
                    └─────────────────────────────────────┘
```

**Layer 1 is the real fix.** If the right tools exist and the system prompt guides the LLM correctly, 95% of the problem disappears.

**Layer 3 is the safety net for the remaining 5%.** If the LLM still does delete+create, the system flags the ambiguity to the user at approval. The user decides.

**Layer 4 does NOT auto-convert.** The diff engine never guesses whether a delete+create pair "was really a rename." It executes what's specified, and Layer 3 already gave the user a chance to catch it.

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

    For each tombstone in desiredState.tombstones:
      → delete_* step (uses tombstone.discordId)

  PHASE 2: TOPOLOGICAL SORT

    Build dependency graph:
      create_channel(parent: $cat_0)  → depends on step that creates $cat_0
      set_overwrite(ch: $ch_0, ...)   → depends on steps creating $ch_0 and referenced role
      delete_category(id)             → all children must be dealt with first

    Default order:
      1. create_category         (parents first)
      2. create_channel
      3. create_role
      4. edit_category            (renames, repositions)
      5. edit_channel
      6. edit_role
      7. move_channel             (change parent)
      8. move_role                (change position)
      9. set_overwrite            (depends on channel + role)
      10. remove_overwrite
      11. delete_channel          (children before parent category)
      12. delete_role
      13. delete_category         (last — all children handled)

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

| Case | Handling |
|------|----------|
| Item in active with Discord ID, but missing from real state | Validation error — someone deleted it externally. Block plan. |
| Item missing from active, no tombstone | Validation error — bug or data corruption. Block plan. |
| Two active items claim same position | Assign sequential positions in execution order |
| External changes during long planning session | Pre-execution validation re-checks assumptions against fresh Discord state and compares the original fork point against current real state. If items touched by the plan were externally modified (not just deleted), the conflict is surfaced to the user: [Re-plan from fresh state] or [Force apply]. This is deferred to Phase 2.
