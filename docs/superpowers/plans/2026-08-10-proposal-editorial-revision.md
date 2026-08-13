# Proposal Editorial Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the proposal's critical synthesis, evidence-qualified comparisons, concision, and objective-to-evidence traceability without changing its scope or reference style.

**Architecture:** Make local prose revisions within the existing five-section proposal. Preserve every existing objective, success threshold, citation, and bibliography entry; the new traceability table only connects established objectives to existing implementation and evaluation evidence.

**Tech Stack:** Markdown, Git diff validation

---

### Task 1: Revise the Proposal Argument and Traceability

**Files:**
- Modify: `docs/report/proposal.md:16-23`
- Modify: `docs/report/proposal.md:152-260`
- Modify: `docs/report/proposal.md:377-411`

- [ ] **Step 1: Qualify the native-workflow observation in Section 1.1**

Replace the claim beginning `In the native administration workflows examined for this project` with:

```markdown
In the native administration workflows examined for this project, these edits are applied directly.
No complete proposed server state, ordered whole-change plan, or general structural undo operation
was identified before the changes affect the live community. This is an observation of the examined
workflow rather than a claim about undocumented Discord capabilities.
```

- [ ] **Step 2: Add a critical synthesis after the constrained-action discussion in Section 2.2**

After the paragraph ending `retain authority over what can reach Discord.`, insert:

```markdown
Together, ReAct and Toolformer support the feasibility of constrained model-mediated interaction,
while the NIST profile supports lifecycle risk management and human oversight. None establishes that
a tool call is semantically correct, authorised for a particular guild, or safe to apply after the
external state has changed. Those guarantees must therefore be supplied by the proposed desired-state
contract, deterministic checks, approval gate, and execution-time revalidation rather than inferred
from model capability or prompt adherence.
```

- [ ] **Step 3: Replace the repetitive identified-gap summary in Section 2.6**

Replace the first paragraph of Section 2.6 with:

```markdown
The literature and product review identify a gap between manual administration and direct AI
automation. Configuration-management practice supplies reviewable desired-state and plan concepts,
while agent research supplies structured natural-language tool use. Neither by itself establishes a
safe workflow for privileged Discord mutation in the presence of approval, authority, external drift,
and partial-failure constraints. The project will evaluate whether its Discord-specific control model
can supply those constraints in one inspectable workflow.
```

Leave the existing second paragraph, beginning `This is an applied software-engineering
contribution`, unchanged.

- [ ] **Step 4: Make related-system limitations consistently evidence-qualified**

Update the comparison wording as follows, without changing the cited sources:

```markdown
Discord's native administration interface provides direct and detailed control, making it the
baseline. The examined documented native workflow does not describe a complete proposed server
state, ordered whole-change plan, or general structural undo operation before changes reach a live
guild. Discord Server Templates add a reusable previewed structure, but the documented native
workflow creates a new guild rather than applying a minimal conversational change to an existing one
(Discord, 2025).
```

In the related-systems table, use these limitation cells:

```markdown
| Discord native settings  | Complete direct platform control                            | Examined documented workflows do not describe a whole-change plan, desired-state history, or general structural rollback workflow |
| Discord Server Templates | Reusable previewed initial structure                        | Documented native workflow creates a new guild rather than reconciling an evolving existing guild |
| Xenon                    | Backups, templates, cloning, and broader archival options   | Public documentation emphasises snapshot/template loading rather than conversational minimal-diff planning |
| BuildMyDiscord           | Closest documented natural-language builder and editor      | Public material does not establish the same complete combination of stale-plan rejection, deterministic whole-plan validation, and snapshot-based convergence |
| AiGuild                  | Lightweight prompt-driven generation inside Discord         | Public listing provides limited evidence of review, validation, iteration, and recovery controls |
| Proposed project         | Declarative planning and controlled existing-guild mutation | Narrower than an all-purpose management or archival bot; recovery remains structural and best effort |
```

- [ ] **Step 5: Add objective-to-evidence traceability after the evaluation table**

Insert the following immediately after the evaluation table and before the paragraph beginning `The
five-person usability target`:

```markdown
The following traceability summary connects the stated objectives to the implementation artefacts and
evaluation evidence already defined in this proposal.

| Objective | Intended implementation evidence | Principal assessment evidence |
| --------- | -------------------------------- | ----------------------------- |
| O1 | Prioritised requirements, use cases, assumptions, and acceptance criteria from Weeks 2-3 | M1 scope-and-evidence review and final requirement traceability |
| O2 | Desired-state store, registered planning tools, planning session, revision, edit, template, and revert workflows | Planning-isolation instrumentation and planning-correctness fixtures |
| O3 | Deterministic diff engine, dependency ordering, assumptions, and structural, permission, and policy validation | Execution-correctness, structural-validation, and policy-validation cases |
| O4 | Approval contract, execution engine, locks, deadlines, retries, snapshots, abort handling, and recovery | Approval-gate, concurrency, retry/deadline, and recovery cases |
| O5 | Authenticated Studio, Discord OAuth, guild authorisation, previews, progress streams, and persisted history | System acceptance cases, security/isolation checks, accessibility review, and usability study |
| O6 | Automated regression suite and controlled integration, system, security, performance, deployment, provider, and usability evaluation | Recorded Pass, Partial, Fail, Blocked, and Not evaluated outcomes against the declared criteria |
| O7 | Architecture, deployment, evaluation, limitation, and traceability documentation | Clean-host deployment evidence and the completed technical report |
```

- [ ] **Step 6: Verify that the revision stays within scope**

Run:

```bash
git diff --check -- docs/report/proposal.md
rg -n "\| O[1-7] \|" docs/report/proposal.md
```

Expected:

```text
- `git diff --check` produces no output.
- The diff changes only the qualified workflow wording, literature synthesis, related-system wording, Section 2.6 summary, and the traceability table.
- `rg` returns exactly seven traceability rows, one for each objective O1 through O7.
```

- [ ] **Step 7: Do not commit unless the user explicitly requests it**

The repository may contain unrelated worktree changes. Leave all changes uncommitted unless the user
separately asks for a commit.
