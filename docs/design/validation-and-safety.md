# Validation & Safety

## The 4-Layer Prevention Stack

Delete+create pairs (where rename was intended) are caught before they reach execution:

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

**Layer 1 is the real fix.** If the right tools exist and the system prompt guides the LLM correctly, most problems never arise.

**Layer 3 is the safety net.** For the rare case where the LLM uses delete+create when rename was intended, the system warns the user at approval. The user decides — not an algorithm.

**Layer 4 does NOT auto-convert.** The diff engine doesn't guess intent. It executes what's specified, and earlier layers already gave the user a chance to intervene.

---

## Two-Stage Validation Pipeline

All plans pass through two validation stages at approval, before execution.

### Stage 1: Hard-Coded Validation (deterministic, fast, no LLM)

Five groups, executed in order:

**A. Permission Checks**
- All permission names are valid (in PermissionFlagsBits)
- Bot has required Discord permissions for each action
- Bot role position >= target role (hierarchy check)
- No attempt to modify roles above bot's role
- Channel overwrites don't lock bot out of channels
- @everyone not being denied VIEW_CHANNEL on all channels (WARNING — bot with ADMINISTRATOR bypasses)

**B. Dependency Checks**
- All symbolic references resolve to a defined symbol
- Symbol types match parameter expectations (parent=$cat_0 must be type "category")
- No circular dependencies in depends_on
- DAG is topologically sortable

**C. Resource Constraints**
- No duplicate names within the plan
- Category child count won't exceed Discord limit (50)
- Role position ordering valid
- Channel type constraints respected (topic only on text, bitrate only on voice)
- Bot has ADMINISTRATOR permission (BLOCK — system refuses to operate without it)

**D. Safety Guards**
- Won't delete IMPORTANT channels without explicit confirmation
- Won't grant ADMINISTRATOR to roles created by the plan (unless explicitly requested)
- Won't remove bot's own permissions
- Won't delete ALL channels from a category
- Rate limit estimate (warn if >5 minutes)

**E. Plan Integrity**
- Plan has at least one step
- No dangling dependencies
- Status is "draft"
- planData JSON matches Zod schema

### Stage 2: LLM Policy Check (semantic, flexible)

- Server rules are included directly in the planning prompt
- LLM compares the plan against all rules
- Violations have severity: **warning** or **block**
- Completeness suggestions are optional ("Did you forget...?") and never block
- No RAG or vector embeddings needed — rules are small and fit in context

---

## Pre-Execution Conflict Detection

Before execution, the system reads fresh Discord state and checks:

- Bot role position still matches?
- Referenced roles/channels still exist? (external deletions during planning)
- No name conflicts for new items?
- Guild still exists and bot is in it?

Any failure → flag conflict → user chooses how to proceed.

---

## Name Guidance (soft, system prompt)

Channel names ≤ 25 chars, category/role names ≤ 20. Not a hard validation rule — Discord max is 100 chars. Preference only. LLM can exceed when clarity requires.
