# Validation & Safety

## The 4-Layer Prevention Stack

See [desired-state-and-diff-engine.md](./desired-state-and-diff-engine.md#the-4-layer-prevention-stack) for the full prevention stack against delete+create rename errors. This doc covers the two-stage validation pipeline below.

---

## Two-Stage Validation Pipeline

Validation happens in stages at different points, not all at approval. Stage 1
(hard-coded checks) runs at the **start of execution**, after the pre-execution
conflict check and before any Discord mutation. Approval itself runs no
validation — it only locks the reviewed desired state as the contract to execute.

Stage 2 (server-rule enforcement) is where doc intent and current code partly
diverge — the **intended** design folds rules into **planning**, but today they
are enforced by a fail-closed check at **execution time**. See the Stage 2
section below for the resolved policy and remaining planning gap.

### Stage 1: Hard-Coded Validation (deterministic, fast, no LLM)

Five groups, executed in order:

**A. Permission Checks**

- Permission names in `set_overwrite` are valid (present in `DISCORD_PERMISSIONS`)
- Bot has ADMINISTRATOR permission (BLOCK — system refuses to operate without it)
- **Bot role position MUST be strictly above every targeted role** — if any plan
  step targets an existing role whose position >= bot's highest role position, the
  plan is BLOCKED.
  This is a hard requirement, same as ADMINISTRATOR. The bot cannot modify roles
  above its own, and partial state from a failed role edit is worse than blocking
  upfront.
- No attempt to modify (`edit_role`/`delete_role`/`move_role`) or assign
  (`add_role_to_member`/`remove_role_from_member`) a role at or above the bot's highest
  role — same hierarchy invariant as above.

> **Not implemented — "bot has required Discord permissions for each action":**
> redundant by construction. ADMINISTRATOR is a hard block above, and it grants
> every permission, so a per-action permission check can never fail on a plan
> that is allowed to run at all. Left out deliberately.

**B. Dependency Checks**

- All symbolic references resolve to a defined symbol
- Symbol types match parameter expectations: `role_id` must reference a `role`
  symbol; `channel_id` and `parent_id` must reference a `channel` symbol.
  (Categories are emitted with symbol type `"channel"` by the diff engine, so a
  category symbol satisfies `parent_id`.) Symbols of type `"unknown"` are skipped.
- No circular dependencies in `dependsOn` (Kahn's algorithm)
- Dependency indices are in range (no dangling `dependsOn` targets)
- DAG is topologically sortable

**C. Resource Constraints**

- No duplicate names within the plan's `create_*` steps
- No duplicate member-role operations (same `member_id:role_id` twice)
- Category child count won't exceed Discord limit (50)
- Channel type constraints respected: `topic` only on text/announcement (type 0/5);
  `bitrate` only on voice/stage (type 2/13)

> **Not implemented — "role position ordering valid":** no concrete invariant to
> enforce among roles below the bot. Discord normalizes role positions server-side,
> and the diff engine emits explicit `move_role` positions that resolve on apply.
> The bot hierarchy boundary itself is validated above.

**D. Safety Guards**

- Won't grant ADMINISTRATOR to roles created by the plan (BLOCK — unless the perm
  set explicitly includes it)
- Rate limit estimate (WARN if the plan may take >5 minutes)
- Overwrite-consolidation hint (WARN): if two unsynced channels
  (`lockPermissions: false`) in the same category carry identical overwrites, the
  plan is flagged to push the shared overwrites up to the category once. This runs
  in `validateOverwriteConsolidation`, tagged `D. Safety`.

> **Not implemented — deliberately.**
>
> - **"Won't remove bot's own permissions":** impossible to hit. The bot holds
>   ADMINISTRATOR, which bypasses all channel overwrites, so it can never be locked
>   out by one. The code documents this rationale inline (`validation.ts`,
>   `validateSafetyGuards`). No check needed.
> - **"Won't delete IMPORTANT channels" / "Won't delete ALL channels from a
>   category":** both contradict the diff engine's Layer 3 philosophy — _present,
>   don't judge; no heuristics, no scoring, no thresholds_. There is no notion of an
>   "important" channel in the model, and tearing down a category is often
>   intentional. The approval UI already surfaces every deletion (with message
>   counts) for the human to accept. A hard block or warning here would be
>   paternalistic. Left out.

**E. Plan Integrity**

- Plan has at least one step
- Status is `draft` or `validated`

> Dangling/circular dependency checks live in Group B (they run over the DAG), not
> here.
>
> **Not implemented — "planData matches Zod schema":** `planData`/steps are produced
> internally by the diff engine (deterministic), never parsed from untrusted input,
> and the TypeScript types already constrain the shape. There is no `PlanData` Zod
> schema and no malformed-input path to guard. Left out.

### Stage 2: Server-Rule Enforcement (semantic, flexible)

Server rules are per-guild natural-language policy strings (`rules` table:
`{ guildId, ruleText }`). The **intended** design is compliant-by-construction:
the rules are injected into the planning prompt so the LLM weighs them as it
builds the plan, and the human approval gate in Studio is the backstop. No RAG or
embeddings — rules are small and fit in context.

> **Implementation status — execution backstop built; planning injection
> remains.** Today the planner (`buildSystemPrompt` in `planning-session.ts`)
> does **not** query the `rules` table. Rule enforcement happens at execution
> time via `validateWithLLM` (`validation.ts`), a second LLM pass tagged
> `Stage 2: Policy` that reads the rules plus a plan summary and returns
> block/warning issues.
>
> The selected design is **prompt plus fail-closed execution backstop**. The
> execution half is implemented: when a guild has rules, execution is blocked if
> the LLM key is missing, the rules cannot be loaded, the provider fails or
> times out after 30 seconds, or its response is empty or malformed. A guild with
> no rules skips the second LLM call and remains fully deterministic. The
> remaining planned change is to inject the same rules into the planning prompt
> so rule-conflicting proposals are less likely to reach review.
>
> Note: a _hardcoded deterministic_ backstop is not an option here — server rules
> are free text, so enforcing them without an LLM would require redesigning the
> `rules` schema into structured predicates.

---

## Pre-Execution Conflict Detection

Before execution, the system reads fresh Discord state and checks:

- Bot role position still matches?
- Referenced roles/channels still exist? (external deletions during planning)
- No name conflicts for new items?
- Guild still exists and bot is in it?

### Conflict Resolution: Re-Plan with Fresh State

When any check fails, execution is **blocked**. There is no "Force Apply" option:
executing against stale assumptions risks partial state on the Discord server,
even with rollback.

**Intended flow — re-plan with fresh state.** The system re-forks the DesiredState
from fresh Discord state, then resumes the planning loop with a repair prompt: the
fresh server state text, the full conversation history, a conflict summary listing
what changed, and an instruction to adapt the plan. The LLM adjusts its tool calls
accordingly — for trivial changes (a rename) this is one tool call; for major
structural drift it may use `ask_user` for guidance. The adapted plan produces a
new iteration in the same conversation. The user reviews the updated plan and
approves again. This preserves the user's conversation context and intent.

> **Implementation status — built.** `POST /plans/:planId/replan` is an explicit,
> user-confirmed repair action. It re-forks from current Discord state, gives the
> planner the persisted conversation context, the prior desired state, and structured
> conflict details, then persists the result as a new iteration. It never executes the
> repaired plan; the user reviews and approves it again. Missing active channels and
> roles are reported by the diff engine as structured conflicts rather than exceptions.

---

## Name Guidance (soft, system prompt)

Channel names ≤ 25 chars, category/role names ≤ 20. Not a hard validation rule — Discord max is 100 chars. Preference only. LLM can exceed when clarity requires.
