# Plan-Driven Subagent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure a frontier primary agent to orchestrate detailed-plan implementation through a scoped Luna worker while retaining final review and integration ownership.

**Architecture:** Keep `explore` as the inherited-model, read-only investigation agent. Convert the existing `executor` into the sole `openai/gpt-5.6-luna` worker, with an explicit implementation mode for bounded code-and-focused-test assignments and a validation mode for command-only checks. A project skill governs the primary-agent workflow, while a concise `AGENTS.md` rule makes the skill discoverable only for approved detailed plans and explicit worker-led requests.

**Tech Stack:** OpenCode JSON configuration, OpenCode agent prompts and skills, Markdown, Prettier, OpenCode CLI.

---

## File Structure

- `opencode.json`: Registers the two project subagents; changes only the executor's model,
  visibility, description, and permissions while preserving all unrelated configuration.
- `.opencode/prompts/executor-guideline.md`: Defines the Luna executor's implementation and
  validation contracts, scope boundaries, and required result statuses.
- `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md`: Teaches the primary agent when
  to trigger the workflow, how to evaluate a plan, safely dispatch executor work, review results,
  and complete verification.
- `AGENTS.md`: Contains a concise trigger rule referring the primary agent to the project skill.
- `docs/IMPLEMENTATION_STATUS.md`: Records the new OpenCode orchestration configuration as a
  developer-workflow capability and updates the status date.

---

### Task 1: Configure the Luna executor agent

**Files:**

- Modify: `opencode.json:20-35`

- [ ] **Step 1: Inspect the current agent configuration and schema-supported fields**

Run:

```bash
opencode agent --help
```

Read `opencode.json` and confirm it already includes:

```json
"$schema": "https://opencode.ai/config.json"
```

Expected: the CLI exposes an agent inspection command, and the config preserves the schema URL,
the `explore` subagent, and the current `executor` prompt path.

- [ ] **Step 2: Change only the executor definition**

Replace the current `executor` object with:

```json
"executor": {
  "description": "Fast scoped worker for bounded implementation, focused tests, and validation",
  "model": "openai/gpt-5.6-luna",
  "mode": "subagent",
  "permission": { "task": "deny" },
  "prompt": "{file:./.opencode/prompts/executor-guideline.md}"
}
```

Do not add a top-level `model`, `small_model`, or `default_agent`. Do not alter the `explore`
object, the Playwright MCP setting, plugin list, or `$schema`. Omitting `edit: deny` gives the
executor the default edit permission needed only for explicitly assigned implementation-mode work;
the executor prompt will prohibit edits in validation mode.

- [ ] **Step 3: Validate the JSON shape locally**

Run:

```bash
pnpm exec prettier --check opencode.json
```

Expected: `Checking formatting...` followed by `All matched files use Prettier code style!`

- [ ] **Step 4: Verify the effective agent configuration with OpenCode**

Run:

```bash
opencode agent list
```

Expected: `explore` is listed as a subagent with no configured model override, and `executor` is
listed as a subagent using `openai/gpt-5.6-luna`. If the command syntax differs, use the command
shown by `opencode agent --help` and verify those same fields in its output.

- [ ] **Step 5: Inspect the configuration-only diff**

Run:

```bash
git diff --check -- opencode.json
git diff -- opencode.json
```

Expected: no whitespace errors, and the diff changes only the executor definition described in
Step 2. Do not commit unless the user explicitly requests it.

### Task 2: Replace the executor prompt with a two-mode worker contract

**Files:**

- Modify: `.opencode/prompts/executor-guideline.md:1-60`

- [ ] **Step 1: Write the implementation-mode contract**

Replace the command-runner-only purpose and strict limits with this opening contract:

```markdown
# Executor Worker Guidelines

**Purpose:** Complete one explicitly assigned bounded implementation task or validation task for
the primary agent. Do not own architecture, plan decomposition, cross-task integration, or final
completion decisions.

Every assignment must declare exactly one mode: `implementation` or `validation`. If the mode,
scope, acceptance criteria, or required context is missing, stop and return `NEEDS_CONTEXT`.

## Implementation Mode

Implementation assignments must include complete task text, allowed files or a clear scope
boundary, relevant patterns or dependencies, acceptance criteria, and focused verification.

- Change only files needed for the assigned task.
- Follow the requested TDD workflow and run the specified focused checks.
- Inspect your diff for scope, correctness, formatting, and unused code before reporting.
- Do not commit, amend, reset, checkout, force-push, or make destructive Git changes.
- Do not launch subagents or expand the assignment into adjacent tasks.
```

- [ ] **Step 2: Add the validation-mode and failure contracts**

Append the following sections after the implementation-mode rules:

```markdown
## Validation Mode

- Run only the commands requested by the primary agent.
- Do not edit files, create workaround patches, install dependencies, diagnose beyond the direct
  command output, or retry unless the primary agent explicitly requests it.
- Return the command, pass/fail result, exit code when available, and the shortest relevant output.

## Status and Report Format

End every assignment with exactly one status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or
`BLOCKED`.

For implementation mode, report changed files, focused verification evidence, self-review result,
and remaining concerns. For validation mode, report command evidence only. Never claim the overall
plan or project is complete; the primary agent reviews and integrates every result.

## Escalation

Use `NEEDS_CONTEXT` when the primary agent did not supply enough information to safely begin. Use
`BLOCKED` when a real blocker remains after the supplied instructions. State the exact missing
context or blocker; do not retry the same vague assignment.
```

- [ ] **Step 3: Check the prompt’s required behavior by searching its text**

Run:

```bash
rg -n "implementation|validation|NEEDS_CONTEXT|BLOCKED|Do not commit|Do not edit files" \
  .opencode/prompts/executor-guideline.md
```

Expected: matches prove that both modes, both escalation statuses, the no-commit rule, and the
validation-mode no-edit rule are present.

- [ ] **Step 4: Format-check the prompt**

Run:

```bash
pnpm exec prettier --check .opencode/prompts/executor-guideline.md
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 5: Inspect the executor prompt diff**

Run:

```bash
git diff --check -- .opencode/prompts/executor-guideline.md
git diff -- .opencode/prompts/executor-guideline.md
```

Expected: no whitespace errors, and the diff replaces only the executor prompt contract. Do not
commit unless the user explicitly requests it.

### Task 3: Add the plan-driven orchestration skill

**Files:**

- Create: `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md`

- [ ] **Step 1: Create the skill metadata and trigger boundary**

Create `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md` with:

```markdown
---
name: plan-driven-subagent-orchestration
description: Use when the user asks to implement an approved, detailed task-structured plan file or explicitly requests worker-led implementation. Orchestrates bounded Luna executor work while the primary agent retains review and integration ownership.
---

# Plan-Driven Subagent Orchestration

Use this workflow only for an approved, detailed plan or an explicit worker-led implementation
request. Do not activate merely because a plan exists in the repository. Continue to invoke other
applicable process skills, including brainstorming, TDD, systematic debugging, and verification.
```

- [ ] **Step 2: Add the primary-agent planning and delegation workflow**

Append this workflow section:

```markdown
## Primary Agent Responsibilities

1. Read the plan once, then extract each task's full text, dependencies, allowed files, acceptance
   criteria, and focused checks.
2. Confirm the plan remains applicable to the current worktree and project instructions.
3. Retain architecture-heavy, ambiguous, security-sensitive, tightly coupled, or broad debugging
   work. Delegate only bounded work with established patterns and clear acceptance criteria.
4. Create task state before dispatching. Provide the executor the complete task text and curated
   context; do not delegate only a plan path.
5. Label every executor assignment `implementation` or `validation`.
6. Review every executor result and actual diff before accepting it. The primary agent alone owns
   cross-task integration, broad verification, and the final completion claim.

## Parallel Dispatch

Dispatch executor tasks in parallel only when files, generated artifacts, migrations, lockfiles,
shared fixtures, route composition, and dependency order do not overlap. If overlap appears,
serialize the remaining work. Different plan task numbers alone do not establish independence.
```

- [ ] **Step 3: Add worker status and completion handling**

Append:

```markdown
## Worker Results

- `DONE`: inspect the diff and focused verification before accepting it.
- `DONE_WITH_CONCERNS`: assess the concern before review; do not defer correctness or scope risk.
- `NEEDS_CONTEXT`: provide the missing information and resume the same bounded assignment.
- `BLOCKED`: change the conditions before retrying by adding context, shrinking the task,
  serializing dependencies, or retaining the work in the primary agent.

Never retry the same vague assignment unchanged. Send concrete review findings back to the worker
when a bounded correction is suitable; retain integration or judgment-heavy corrections yourself.

## Completion

After task-level review, run required broad checks directly or send an explicit `validation`
assignment to the executor. Diagnose failures at the primary-agent level, delegate only bounded
fixes, rerun affected checks, and invoke verification-before-completion before reporting success.
```

- [ ] **Step 4: Verify the new skill is discoverable and correctly scoped**

Run:

```bash
opencode agent list
```

Then start a fresh OpenCode session and confirm `plan-driven-subagent-orchestration` appears in the
available skills. If the CLI has a skill-list command in `opencode --help`, use it instead. Inspect
the loaded description and confirm it mentions both detailed plans and explicit worker-led
implementation.

Expected: OpenCode discovers the skill from `.opencode/skills/` after restart, and its description
does not say it applies to every implementation request.

- [ ] **Step 5: Format-check the skill**

Run:

```bash
pnpm exec prettier --check .opencode/skills/plan-driven-subagent-orchestration/SKILL.md
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 6: Inspect the orchestration skill diff**

Run:

```bash
git diff --check -- .opencode/skills/plan-driven-subagent-orchestration/SKILL.md
git diff -- .opencode/skills/plan-driven-subagent-orchestration/SKILL.md
```

Expected: no whitespace errors, and the new skill contains only the approved trigger, delegation,
review, failure, and completion workflow. Do not commit unless the user explicitly requests it.

### Task 4: Add the project trigger and update implementation status

**Files:**

- Modify: `AGENTS.md:30-35`
- Modify: `docs/IMPLEMENTATION_STATUS.md:1-7`

- [ ] **Step 1: Add the concise trigger rule to AGENTS.md**

Under `### Goal-Driven Execution`, after the existing verification bullets, add:

```markdown
- When the user asks to implement an approved detailed plan or explicitly requests worker-led
  implementation, invoke `plan-driven-subagent-orchestration`. Keep orchestration, review,
  integration, and complex work with the primary agent; use `executor` only for bounded,
  explicitly scoped implementation or validation assignments.
```

Do not restate the skill's full workflow in `AGENTS.md`.

- [ ] **Step 2: Record the completed developer-workflow capability**

Update `docs/IMPLEMENTATION_STATUS.md`:

```markdown
Last updated: 2026-08-12
```

Add a `### OpenCode workflow` subsection before `### Tests`:

```markdown
### OpenCode workflow

- `done` Plan-driven subagent orchestration — `opencode.json`,
  `.opencode/prompts/executor-guideline.md`, and
  `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md` (frontier primary agent retains
  plan decomposition, review, integration, and final verification; read-only `explore`; scoped
  Luna `executor` supports bounded implementation and validation assignments)
```

Do not modify unrelated subsystem entries.

- [ ] **Step 3: Verify the trigger and status entry**

Run:

```bash
rg -n "plan-driven-subagent-orchestration|OpenCode workflow|openai/gpt-5\.6-luna" \
  AGENTS.md docs/IMPLEMENTATION_STATUS.md opencode.json
```

Expected: matches show the AGENTS trigger, status entry, and Luna model identifier.

- [ ] **Step 4: Format-check the documentation**

Run:

```bash
pnpm exec prettier --check AGENTS.md docs/IMPLEMENTATION_STATUS.md
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 5: Inspect the trigger and status documentation diff**

Run:

```bash
git diff --check -- AGENTS.md docs/IMPLEMENTATION_STATUS.md
git diff -- AGENTS.md docs/IMPLEMENTATION_STATUS.md
```

Expected: no whitespace errors, and the documentation changes contain only the concise trigger and
the OpenCode workflow status entry. Do not commit unless the user explicitly requests it.

### Task 5: Validate the complete configuration without implementing an unrelated plan

**Files:**

- Verify: `opencode.json`
- Verify: `.opencode/prompts/executor-guideline.md`
- Verify: `.opencode/skills/plan-driven-subagent-orchestration/SKILL.md`
- Verify: `AGENTS.md`
- Verify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run repository formatting checks for all changed configuration files**

Run:

```bash
pnpm exec prettier --check \
  opencode.json \
  .opencode/prompts/executor-guideline.md \
  .opencode/skills/plan-driven-subagent-orchestration/SKILL.md \
  AGENTS.md \
  docs/IMPLEMENTATION_STATUS.md
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 2: Inspect effective OpenCode agents after restarting OpenCode**

Quit the running OpenCode session and restart it from the repository root because config, agents,
and skills are loaded only at startup. Then run:

```bash
opencode agent list
```

Expected: `explore` remains a read-only subagent with inherited model selection. `executor` is a
visible subagent using `openai/gpt-5.6-luna`; it can edit and run commands but cannot launch nested
subagents because its `task` permission is denied.

- [ ] **Step 3: Perform a dry orchestration review against an existing detailed plan**

In the restarted OpenCode session, send this message without authorizing implementation:

```text
Review docs/superpowers/plans/2026-08-12-openrouter-model-switching.md using the
plan-driven-subagent-orchestration workflow. Do not edit files or run implementation tasks. List
which tasks are sequential, which could be parallel, which files overlap, and which tasks the
frontier primary agent should retain.
```

Expected: the primary agent invokes the new skill, reads the plan, identifies that database schema
and migration work must precede route/planning work, does not dispatch or edit anything, and only
marks file-disjoint work as parallel candidates.

- [ ] **Step 4: Review the complete diff for scope**

Run:

```bash
git diff --check
git diff -- AGENTS.md opencode.json .opencode/prompts/executor-guideline.md \
  .opencode/skills/plan-driven-subagent-orchestration/SKILL.md docs/IMPLEMENTATION_STATUS.md
```

Expected: no whitespace errors and changes limited to the approved configuration, prompt, skill,
project trigger, and status documentation.

- [ ] **Step 5: Report final validation evidence**

Report the OpenCode agent-list result, skill-discovery result, dry-review result, Prettier result,
and `git diff --check` result. State that OpenCode must be restarted for the changed configuration,
prompt, and skill to take effect. Do not commit unless the user explicitly requests it.
