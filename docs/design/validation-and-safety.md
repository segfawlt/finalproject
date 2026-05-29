# Validation & Safety

## The 4-Layer Prevention Stack

See [desired-state-and-diff-engine.md](./desired-state-and-diff-engine.md#the-4-layer-prevention-stack) for the full prevention stack against delete+create rename errors. This doc covers the two-stage validation pipeline below.

---

## Two-Stage Validation Pipeline

All plans pass through two validation stages at approval, before execution.

### Stage 1: Hard-Coded Validation (deterministic, fast, no LLM)

Five groups, executed in order:

**A. Permission Checks**

- All permission names are valid (in PermissionFlagsBits)
- Bot has required Discord permissions for each action
- **Bot role position MUST be highest in the server** — if any plan step targets
  an existing role whose position > bot's highest role position, the plan is BLOCKED.
  This is a hard requirement, same as ADMINISTRATOR. The bot cannot modify roles
  above its own, and partial state from a failed role edit is worse than blocking
  upfront.
- No attempt to modify roles above bot's role (same check as above — single
  validation logic)
- Bot has ADMINISTRATOR permission (BLOCK — system refuses to operate without it)

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
- Status is "draft" or "validated"
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

### Conflict Resolution: Re-Plan with Fresh State

When any check fails, execution is **blocked**. The user is shown a conflict summary and a single action:

**Re-plan with fresh state.** The system re-forks the DesiredState from fresh Discord state, then resumes the planning loop with a repair prompt: the fresh server state text, the full conversation history, a conflict summary listing what changed, and an instruction to adapt the plan. The LLM adjusts its tool calls accordingly — for trivial changes (a rename) this is one tool call; for major structural drift it may use `ask_user` for guidance. The adapted plan produces a new iteration in the same conversation. The user reviews the updated plan and approves again.

There is no "Force Apply" option. Executing a plan against stale assumptions risks partial state on the Discord server, even with rollback. The exclusive path is to feed the LLM fresh state and let it repair the plan — preserving the user's conversation context and intent.

---

## Name Guidance (soft, system prompt)

Channel names ≤ 25 chars, category/role names ≤ 20. Not a hard validation rule — Discord max is 100 chars. Preference only. LLM can exceed when clarity requires.
