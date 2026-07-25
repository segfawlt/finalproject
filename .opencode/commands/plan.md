---
description: Generate a micro implementation plan using writing-plans skill
---
Use the writing-plans skill to create an implementation plan for $ARGUMENTS.

Before planning — check existing learnings:
Per AGENTS.md, read docs/learnings/README.md and check entries with tags
relevant to $ARGUMENTS. If a learning's tag matches, read the full file
and apply its lesson. Embed each learning's key constraint directly in
the task that touches its area, with a reference to the file. Example:
  "Note: per docs/learnings/database-issues/jsonb-casting-for-plan-data.md,
  plan_data must be cast `as unknown as PlanData` when reading. The code
  block above already applies this cast."

Override the skill's executor assumption:
The skill says "assume zero context for our codebase" and "know almost
nothing about our toolset or problem domain." Override both — the
executor shares this session's full codebase context and knows the
toolset. What it does NOT have is reliable design judgment. Treat its
taste as questionable and its test design as weak. So:
- Keep every step self-contained with complete code (the skill's
  "No Placeholders" rule applies in full).
- Do NOT rely on the executor to look up types, infer intent, pick
  between valid approaches, or design tests. Spell out the test code
  in full.

Keep Docs In Sync:
Per AGENTS.md, if a task changes a feature/route/file, include a
doc-update step in the same task — update docs/IMPLEMENTATION_STATUS.md
(add new files to the right subsection, move resolved gaps to
"Recently resolved", bump the "Last updated" date) and any affected
design docs. This is part of the surgical change, not a separate effort.

Make each task git-diff-reviewable:
The skill's "Files: Create/Modify: path:line-range" format is the
review surface. After each task the executor will run
`git diff HEAD~1 --stat` and compare the changed files to the task's
Files section. So:
- One logical change per task. If a task touches many files for
  several different reasons, split it. If it touches many files for
  one reason (e.g., updating an interface used in several places),
  keep it as one task.
- In each Modify line, specify exact line ranges, e.g.
  `src/models/user.ts:15-30` (the interface block), not just the file.

Flag complex tasks:
If a task needs multi-file integration, design judgment, or broad
codebase understanding, prefix its title with "[COMPLEX]". This
signals the executor to STOP on first uncertainty rather than guess,
and signals me that a stronger model may be needed for that one task.
Tasks that touch 1-2 files with a complete spec should NOT be flagged.

Plan header:
In the required header, point to superpowers:executing-plans as the
REQUIRED SUB-SKILL (not subagent-driven-development — the executor
runs in this session, not via subagents).

Run the Self-Review from the skill (spec coverage, placeholder scan,
type consistency) before declaring the plan done.

After saving the plan to docs/superpowers/plans/YYYY-MM-DD-<feature>.md
per the skill's default, output the full path on its own line, prefixed
with "PATH: ", so I can pass it to the executor. Example:
PATH: docs/superpowers/plans/2026-06-23-<feature>.md
