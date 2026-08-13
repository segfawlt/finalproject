# Plan-Driven Subagent Orchestration Design

## Goal

Improve implementation quality and speed when a detailed implementation plan exists by keeping
architecture, decomposition, review, and integration decisions with the frontier primary agent
while delegating bounded coding and validation work to a faster model.

The workflow must also be available when the user explicitly requests worker-led implementation.
Ordinary implementation requests without a detailed plan continue to use the primary agent's
normal judgment.

## Decision

Use a hybrid of project instructions, a project skill, and the existing subagent configuration:

- Add one concise rule to `AGENTS.md` that triggers the plan-driven orchestration skill when the
  user asks to implement an approved, task-structured plan or explicitly requests worker-led
  implementation.
- Add a project skill that defines the orchestration workflow for the primary agent.
- Keep two visible subagent roles: `explore` and `executor`.
- Keep `explore` read-only and on the current inherited model.
- Change `executor` to `openai/gpt-5.6-luna` and broaden it from a command-only runner into a
  scoped implementation and validation worker.
- Do not pin the primary model. The user remains free to select the frontier model for the main
  session.

No additional implementer or reviewer agent is needed. The assignment prompt, not a separate
agent name, distinguishes implementation work from validation work. The frontier primary agent
retains review responsibility because review, integration, and escalation require the strongest
judgment.

## Agent Responsibilities

### Primary Agent

The primary agent owns the complete workflow and remains accountable for the result. It:

- reads the plan and relevant project guidance;
- checks that the plan is approved, sufficiently detailed, and still applicable;
- extracts tasks, dependencies, assigned files, and acceptance criteria;
- decides which tasks are suitable for Luna and which require frontier-level reasoning;
- creates and maintains task state;
- sends bounded assignments with all required context to `executor`;
- reviews every worker result and diff against the plan and project conventions;
- resolves architecture, integration, ambiguity, and non-trivial debugging issues;
- requests corrections with concrete evidence when worker output is incomplete or incorrect;
- runs or delegates final verification; and
- is the only agent that declares the implementation complete.

The primary agent may implement work itself when a task is architecture-heavy, ambiguous,
tightly coupled, unexpectedly complex, or unsafe to delegate. Delegation is a quality and speed
tool, not a prohibition on primary-agent editing.

### Explore Subagent

`explore` remains a read-only semantic codebase investigator. It uses the inherited/current model,
cannot edit or delegate, and returns focused evidence for questions from the primary agent.

### Executor Subagent

`executor` uses `openai/gpt-5.6-luna`. It cannot launch subagents. Every assignment must declare
one of two modes:

1. **Implementation mode:** make a bounded code change, follow the specified test workflow, run
   focused verification, self-review the diff, and report the result.
2. **Validation mode:** run only the requested commands, do not edit, and return compact evidence.

In implementation mode, the assignment must provide:

- the complete task text rather than only a plan path;
- why the task exists and how it fits the larger change;
- allowed files or an explicit scope boundary;
- dependencies and relevant existing patterns;
- acceptance criteria and exact focused checks;
- restrictions, including no commits and no destructive Git operations; and
- the expected result format.

The executor must not reinterpret the entire plan, expand scope, modify unrelated files, or claim
overall completion. It returns one status:

- `DONE`
- `DONE_WITH_CONCERNS`
- `NEEDS_CONTEXT`
- `BLOCKED`

The report also lists changed files, focused verification evidence, self-review findings, and any
remaining concerns.

## Triggering

The orchestration skill activates automatically only when:

- the user asks to implement an approved, task-structured plan file; or
- the user explicitly asks the primary agent to use workers or subagents for implementation.

The skill does not activate merely because a plan file exists somewhere in the repository. It
also does not replace brainstorming, planning, debugging, TDD, verification, or other applicable
workflow skills.

For an implementation request without a detailed plan, the primary agent uses normal judgment. It
may still delegate a task when the user explicitly requests this workflow and the primary agent can
provide a safe, complete assignment.

## Execution Flow

1. The primary agent reads the plan once and extracts every task with its full instructions.
2. It checks dependencies, overlapping files, migrations, generated artifacts, and shared state.
3. It creates a task list and marks only active work in progress.
4. It keeps architecture-heavy or ambiguous work and delegates bounded mechanical work.
5. It may dispatch independent tasks concurrently only when their files, generated artifacts,
   database changes, and dependency order do not overlap.
6. Each executor assignment states either implementation mode or validation mode.
7. The primary agent reviews each result and the actual worktree diff before accepting it.
8. If corrections are needed, the primary agent resumes the same worker context with exact issues
   and acceptance criteria.
9. If parallel work unexpectedly overlaps, the primary agent stops parallel integration and
   serializes the remaining work.
10. After all task-level reviews pass, the primary agent delegates broad commands to `executor` in
    validation mode or runs them directly when appropriate.
11. The primary agent diagnoses failures, delegates bounded fixes when suitable, re-runs affected
    checks, and performs final verification before reporting completion.

## Delegation Rules

A task is a good Luna assignment when it has clear acceptance criteria, bounded files, established
patterns, and limited architectural judgment. Examples include implementing a fully specified
function, adding focused tests, wiring a prescribed route, or applying a mechanical update across
known files.

The primary agent should retain a task when it requires architecture decisions, broad integration
reasoning, unclear requirements, security-sensitive judgment, root-cause analysis across
subsystems, or conflict resolution between the plan and current code.

Parallel delegation is allowed only for genuinely independent work. "Different plan tasks" is not
enough: shared imports, schema files, lockfiles, route composition, generated metadata, and tests
that mutate common fixtures count as overlap.

## Failure Handling

- `DONE`: review the diff and evidence before accepting the task.
- `DONE_WITH_CONCERNS`: assess the concerns before review; do not ignore correctness or scope risk.
- `NEEDS_CONTEXT`: provide the missing context and resume the same assignment.
- `BLOCKED`: change something before retrying by adding context, shrinking the task, serializing
  dependencies, or moving the work to the primary agent.

The same vague prompt must not be retried unchanged. The primary agent must not accept "close
enough" output that violates the plan. Worker self-review supports but never replaces primary-agent
review.

## Configuration Changes

The implementation will:

- update `opencode.json` so `executor` uses `openai/gpt-5.6-luna`, can edit, can run commands, and
  cannot delegate;
- replace the command-runner-only executor prompt with the two-mode worker contract;
- add a project skill under `.opencode/skills/` for plan-driven orchestration; and
- add the concise trigger rule to `AGENTS.md`.

The existing `$schema`, unrelated OpenCode settings, and `explore` configuration remain unchanged.
OpenCode must be restarted after these config-time files change.

## Validation

The completed configuration must satisfy all of the following:

- `opencode.json` validates against `https://opencode.ai/config.json`.
- `explore` remains read-only and cannot delegate.
- `executor` resolves to `openai/gpt-5.6-luna`, can edit and run commands, and cannot delegate.
- The skill description clearly triggers for detailed-plan implementation and explicit
  worker-led implementation without triggering for every coding request.
- The executor prompt requires a declared assignment mode and prohibits edits in validation mode.
- A dry review using an existing detailed plan shows that the primary can identify dependencies,
  delegate bounded tasks, and retain complex work without executing the plan.
- Changed JSON and Markdown pass applicable formatting checks.

## Trade-Offs

Using one broad executor keeps routing simple and avoids two agents that use the same fast model.
The cost is that validation-mode read-only behavior is enforced by the prompt rather than a hard
`edit: deny` permission. The primary agent mitigates this by labeling every assignment, reviewing
the worktree after every result, and never accepting unreviewed changes.

The design intentionally avoids adding fast-model reviewer agents. Review remains with the
frontier model so cost savings do not remove the judgment layer responsible for the expected
quality improvement.
