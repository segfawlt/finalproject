# Compound Learning System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "compounding learning" memory layer to the Discord Platform project so the agent captures durable lessons from bug fixes and reuses them in future sessions — without adopting the full Compound Engineering plugin.

**Architecture:** Two OpenCode skills (`compound` for writing, `compound-refresh` for hygiene) + one docs directory (`docs/learnings/`) with categorized subfolders and YAML frontmatter, wired together via an `AGENTS.md` directive. Overlap detection, reference counting, term surfacing, and Discoverability Check run inside the writing skill.

**Tech Stack:** Markdown + YAML frontmatter, OpenCode skills, no runtime dependencies, no new packages.

**Note on lint/typecheck:** All artifacts created in this plan are markdown files. No `pnpm lint` or `pnpm typecheck` runs are needed.

---

## File Structure

### Created

- `.opencode/skills/compound/SKILL.md` — writing skill (~4KB)
- `.opencode/skills/compound-refresh/SKILL.md` — hygiene skill (~2KB)
- `docs/learnings/README.md` — index with categories, pending terms, promote candidates
- `docs/learnings/<category>/<slug>.md` — one per learning (e.g., `docs/learnings/database-issues/jsonb-casting-for-plan-data.md`)

### Modified

- `AGENTS.md` — add "Compound Learnings" subsection under "Agent Behavior" (~25 lines)

### Existing conventions to follow

- Skills live under `.opencode/skills/<skill-name>/SKILL.md` (existing pattern: `frontend-design`, `classifying-codebase-problems`)
- Skill frontmatter: `name`, `description`, optional `license`
- Docs use kebab-case files, `##` headings, single-h1 per file
- AGENTS.md style: prose, terse, "###" subsections, never heading-soup
- Markdown: double quotes, semicolons not applicable, trailing commas not applicable
- File exploration uses Glob/Grep/read tools, not bash `ls`/`grep`/`cat`

---

## Task 1: Create the `compound` Skill (Writing)

**Files:**

- Create: `.opencode/skills/compound/SKILL.md`

- [ ] **Step 1: Create the skills directory**

```bash
mkdir -p .opencode/skills/compound
```

- [ ] **Step 2: Write the SKILL.md file**

Write the file `.opencode/skills/compound/SKILL.md` with the following content exactly:

````markdown
---
name: compound
description: Use after fixing a non-trivial bug, solving a tricky problem, or discovering a non-obvious workaround, to capture a durable lesson in docs/learnings/. Trigger phrases: "that worked", "it's fixed", "working now", "problem solved".
---

# Compound Learning

Document a solved problem so future agents don't re-discover the lesson. The first time you solve a problem takes research; document it, and the next occurrence takes minutes.

## When to Invoke

Invoke this skill when ALL three are true:

1. The problem has been **solved and verified** (not in-progress, not unverified)
2. The lesson is **non-trivial** (not a typo, not a single-line tweak)
3. The lesson is **durable** (would a future agent make the same mistake without this?)

Trigger phrases that should prompt invocation: "that worked", "it's fixed", "working now", "problem solved".

If only 1-2 of the three conditions are met, skip — output the skip message below and do nothing.

## Quality Gate (Is This Worthy?)

Before writing, run through these four questions. If **2 or more are yes**, write the learning. If unsure, err toward not writing.

- Would a future agent make the same mistake without this?
- Is this a non-obvious workaround for a library, framework, or Discord.js quirk?
- Does this contradict a likely assumption (e.g., "X must be called before Y")?
- Will this pattern recur in the same module/area?

## Storage

**Path:** `docs/learnings/<category>/<slug>.md`

**Categories** (use the first one that fits, add a new one only if nothing matches):

- `build-errors/` — TypeScript, Vite, pnpm, bundler issues
- `test-failures/` — Vitest, mock setup, assertion gotchas
- `runtime-errors/` — Production crashes, unhandled rejections
- `database-issues/` — Drizzle, PostgreSQL, migrations, JSONB
- `permissions/` — Discord permission bits, role hierarchy, overwrites
- `bot-lifecycle/` — Discord.js cache, event handlers, reconnection
- `auth/` — Better Auth, OAuth, session handling
- `integration-issues/` — Hono routes, SSE, middleware interactions
- `logic-errors/` — Diff engine, execution engine, planning session bugs
- `architecture-patterns/` — Project structure, module boundaries, design decisions
- `design-patterns/` — Reusable non-architectural patterns
- `conventions/` — Team-agreed way of doing something
- `tooling-decisions/` — Library or tool choices with durable rationale
- `best-practices/` — Fallback only when no narrower category applies

**Slug:** kebab-case, descriptive, 3-6 words. Examples: `jsonb-casting-for-plan-data`, `discord-perm-overwrite-order`, `drizzle-must-quote-snake-case`.

**Filename includes NO date** — the `date:` frontmatter field is canonical. This prevents re-numbering on every write.

## Format (Two Tracks)

**Bug track** — for fixes to broken code:

```markdown
---
title: Short searchable title
category: database-issues
module: planning/diff-engine
tags: [drizzle, jsonb, type-cast]
problem_type: runtime-error
date: 2026-06-20
---

# Short Title

## Problem

1-2 sentence description of the issue.

## Symptoms

Observable symptoms (error messages, behavior). Include the actual error text.

## What Didn't Work

Failed investigation attempts and why they failed. This prevents the next agent from re-trying them.

## Solution

The actual fix with code examples. Use before/after when applicable.

\`\`\`ts
// Before
const data = row.plan_data;

// After
const data = row.plan_data as unknown as PlanData;
\`\`\`

## Why This Works

Root cause explanation — why the solution addresses the underlying problem.

## Prevention

Strategies to avoid recurrence. Include test cases or assertions where applicable (adapt to your actual case).

\`\`\`ts
it("should cast JSONB to PlanData", () => {
// Example — adapt to the actual behavior you want to verify
expect(row.planData).toMatchObject({ steps: expect.any(Array) });
});
\`\`\`

## References

0
```
````

**Knowledge track** — for design decisions, patterns, or non-bug lessons:

```markdown
---
title: Short searchable title
category: architecture-patterns
module: packages/shared
tags: [execute-context, testing, mocks]
problem_type: design-decision
date: 2026-06-20
---

# Short Title

## Context

What situation, gap, or friction prompted this guidance.

## Guidance

The practice, pattern, or recommendation. Include code examples when useful.

## Why This Matters

Rationale and impact of following or not following this guidance.

## When to Apply

Conditions or situations where this applies.

## Examples

Concrete before/after or usage examples showing the practice in action.

## References

0
```

**Frontmatter rules:**

- All four required: `title`, `category`, `tags`, `date`
- `module` is optional but recommended (helps grep by area)
- `problem_type` is optional but recommended (e.g., `runtime-error`, `build-error`, `design-decision`, `convention`)
- `last_updated` is OPTIONAL — include ONLY when updating an existing doc (omit on new docs)
- `tags` must be a YAML array (use `[]` if none, never inline comma-separated)

**YAML safety:** Quote any value containing ` #` (space-hash) or `: ` (colon-space) to prevent silent YAML truncation. The `title:` field is the most common offender.

**`## References` section:** Every learning ends with a `## References` heading followed by a single integer count. Starts at `0` for new docs. The agent increments this integer when the learning is re-consulted in a future session (see Workflow Step 6).

## Workflow (Read This Before Writing)

**Step 1: Overlap detection**

Before writing, search the target category directory for similar problems using the Grep and Glob tools (NOT bash `ls`/`grep`):

- Use `Glob` to list files in `docs/learnings/<category>/`
- Use `Grep` to search for keywords in titles, tags, and module fields across the category
- Also Grep the README index for related tags

If a closely related learning exists, **read it first** and assess overlap:

| Overlap                                              | Action                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **High** (same problem + same root cause + same fix) | **Update the existing doc** with fresher context. Add `last_updated: <today>`. Do not create a duplicate. |
| **Moderate** (same area, different angle)            | Create the new doc, then add a "Related" link in both files                                               |
| **Low or none**                                      | Create the new doc normally                                                                               |

Two docs describing the same problem will drift apart. Updating the existing one is always better than creating a second one that immediately needs consolidation.

**Step 2: Write the file**

Create `docs/learnings/<category>/<slug>.md` with the appropriate track template. Include the `## References` section at the bottom, initialized to `0`.

**Step 3: Update the README index**

Edit `docs/learnings/README.md` to add a bullet in the relevant category section:

```markdown
# Learnings Index

## database-issues/

- [JSONB casting for plan_data](./database-issues/jsonb-casting-for-plan-data.md) — must cast `as unknown as PlanData` to read. `#drizzle #jsonb`
```

If `docs/learnings/README.md` does not exist yet, create it with the standard preamble:

```markdown
# Learnings Index

Indexed catalog of durable lessons captured by the `compound` skill. Read at session start; check entries with relevant tags before non-trivial work.

## Pending Terms

Domain-specific terms flagged for `CONCEPTS.md` (project vocabulary glossary). When this list has 5+ terms, bootstrap `CONCEPTS.md` at repo root.

## Promote Candidates

Lessons referenced 3+ times that may deserve a spot in `AGENTS.md` as a project-wide rule. Review weekly.

## <Category Name>/

- [Title](./<category>/<slug>.md) — summary. `#tag1 #tag2`
```

**Step 4: Term surfacing**

After writing, scan the new learning for project-specific terms that have meaning beyond their obvious dictionary definition. Strong examples in this project: `Tombstone`, `Symbol`, `DesiredState`, `DriftEvent`, `Assumption`, `PlanStatus`, `IterationType`. (Self-explanatory UI surface names like `Studio` and `Dashboard` do NOT qualify — they're not domain terms with project-specific meaning.)

If you identify a qualifying term:

- If `CONCEPTS.md` exists at repo root → add the term to it (one-line definition)
- If not → add the term to the "## Pending Terms" section of `docs/learnings/README.md`

When "## Pending Terms" accumulates 5+ terms, you (or `compound-refresh`) should bootstrap `CONCEPTS.md` from the list.

**Step 5: Discoverability Check**

Verify that `AGENTS.md` would lead an agent to discover `docs/learnings/` before starting work in a documented area. The check is: does `AGENTS.md` mention `docs/learnings/` anywhere?

- If yes → no action needed
- If no → add a single line to the "Compound Learnings" section in `AGENTS.md`

This runs every time the skill is invoked. If the mention is already present, do nothing.

**Step 6: Reference tracking (when consulting an existing learning)**

When you apply an existing learning to a current problem (i.e., you read a learning file and use its guidance), increment its `## References` count by 1 using the Edit tool. If the count reaches **3 or more**, add a bullet to the "## Promote Candidates" section of `docs/learnings/README.md` with the learning's title and a one-line rationale (e.g., "Used in 3 bug fixes across X, Y, Z").

The user reviews "Promote Candidates" weekly and decides whether to promote any of them to `AGENTS.md` as a project-wide rule. You (the agent) never write to `AGENTS.md` directly.

## Preconditions (Advisory)

This skill is advisory, not enforced. The preconditions are:

- `problem_solved` — the problem has a working fix
- `solution_verified` — the fix has been tested or observed working
- `non_trivial` — not a typo, not a one-line change

If any precondition fails, the agent may still proceed but should note which condition failed in the learning's "What Didn't Work" section (so future agents know the solution is unverified).

## Outputs (What to Tell the User)

**On success (wrote a learning):**

```
Learning captured: docs/learnings/<category>/<slug>.md — <title>.
Term surfaced: <term or "none">.
References: <n> (this counts as 1).
```

**On skip (decided not to write):**

```
No learning captured — <one-sentence reason, e.g., "the fix was a single-line typo" or "the lesson isn't durable enough to merit a learning">.
```

**On update (modified existing doc):**

```
Learning updated: docs/learnings/<category>/<slug>.md — <title>.
```

## What This Skill Does NOT Do

- **No automatic promotion to AGENTS.md** — the agent only flags candidates; you decide what becomes a rule
- **No parallel subagents** — single-pass, no fan-out
- **No session history search** — that's a separate concern
- **No specialized agent reviews** — write the learning, move on

````

- [ ] **Step 3: Verify the file was created**

Run: `ls -la .opencode/skills/compound/`
Expected: `-rw-r--r-- ... SKILL.md` showing the file exists

- [ ] **Step 4: Verify the file structure**

Run: `head -5 .opencode/skills/compound/SKILL.md`
Expected: First line is `---`, followed by `name: compound` and `description: Use after...`

- [ ] **Step 5: Commit**

```bash
git add .opencode/skills/compound/SKILL.md
git commit -m "feat(skills): add compound skill for writing durable learnings"
````

---

## Task 2: Create the `compound-refresh` Skill (Hygiene)

**Files:**

- Create: `.opencode/skills/compound-refresh/SKILL.md`

- [ ] **Step 1: Create the skills directory**

```bash
mkdir -p .opencode/skills/compound-refresh
```

- [ ] **Step 2: Write the SKILL.md file**

Write the file `.opencode/skills/compound-refresh/SKILL.md` with the following content exactly:

```markdown
---
name: compound-refresh
description: Review and clean up docs/learnings/ — detect stale references, duplicates, and obsolete docs. Use when the user asks to "refresh my learnings", "audit docs/learnings/", or on a monthly cadence. Do not trigger for general debugging or refactor work unless the user explicitly points at docs/learnings/.
---

# Compound Refresh

Maintain the quality of `docs/learnings/` over time. Reviews existing learnings against the current codebase and removes or updates drifted ones.

## When to Invoke

- User says "refresh my learnings", "audit docs/learnings/", "clean up stale learnings"
- Monthly maintenance cadence (suggested)
- After a major refactor or dependency upgrade that may have invalidated references
- When `compound` flagged a related learning as potentially superseded

## Interaction

Ask **one question at a time** using the platform's blocking question tool. Prefer **multiple choice** with a recommendation. Lead with evidence — don't ask before you have it.

## Scope Selection

If the user provides a scope hint (filename, category, or module), narrow to that scope. Otherwise, process all of `docs/learnings/`.

For broad scope (20+ learnings), do a lightweight triage:

1. Read frontmatter of all learnings, group by category
2. For each cluster, check if primary referenced files still exist
3. Recommend starting with the cluster that has the most broken references

## Maintenance Outcomes

For each candidate learning, classify into one of five outcomes:

| Outcome         | When                                                             | Action                                                       |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ |
| **Keep**        | Still accurate and still useful                                  | No file edit. Report reviewed-without-edits.                 |
| **Update**      | Core lesson correct, but file paths/names/links drifted          | Apply in-place edits, set `last_updated: <today>`            |
| **Consolidate** | Two learnings overlap heavily but are both correct               | Merge unique content into canonical doc, delete subsumed doc |
| **Replace**     | Core guidance is now misleading, but a better replacement exists | Write a successor (use the `compound` skill), delete the old |
| **Delete**      | Code/workflow gone, problem domain gone, no inbound links        | Delete the file. Git history preserves it.                   |

## Drift Classification: Update vs Replace

The critical question: **is the drift cosmetic or substantive?**

- **Update territory** — file paths moved, classes renamed, links broke, but the recommended approach still works. Fix the references.
- **Replace territory** — the recommended fix conflicts with current code, the pattern changed, or the architecture shifted. Write a new learning via the `compound` skill, then delete the old.

If you find yourself rewriting the "Solution" or "Why This Works" section, stop — that's Replace, not Update.

## Before Deleting: Check Three Things

1. **Is the implementation gone?** Use Grep to search for the file paths or class names in the learning. If the code moved, prefer Update.
2. **Is the problem domain still active?** Before deleting a learning about Discord permissions, check if the project still uses Discord permissions. If yes, the concept persists — that's Replace, not Delete.
3. **Are there inbound links?** Use Grep on all `*.md` files in the repo for the filename slug. If other docs cite this learning, signal Replace (don't leave dangling references).

**Auto-delete only when all three hold:**

- Implementation is gone (or fully superseded)
- Problem domain is gone
- Inbound links are absent or only decorative ("see also" pointers)

If any condition fails, prefer Update, Replace, or Consolidate.

## Delete, Don't Archive

There is no `_archived/` directory. When a doc is no longer useful, delete the file. Git history preserves it. A dedicated archive directory accumulates stale docs that pollute search results.

## Term Accumulation Check

After processing learnings, check `docs/learnings/README.md` → "## Pending Terms":

- If the list has **5+ terms** → suggest bootstrapping `CONCEPTS.md` (project vocabulary glossary) at repo root
- If less → no action

**Bootstrap process** (one-time action when threshold hit):

1. Create `CONCEPTS.md` at repo root with this preamble:

   > Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded from accumulated learnings, then accretes over time; direct edits are fine. Glossary only, not a spec or catch-all.

2. Copy the "Pending Terms" list into the new file as bullet entries (one line each: term — short definition)
3. Empty the "## Pending Terms" section in `docs/learnings/README.md` (replace contents with `_(no pending terms)_`)

## Reference Count: Promote Candidates

The `compound` skill tracks references via the "## Promote Candidates" section in `docs/learnings/README.md`. A learning hits "promote candidate" status after 3 references.

This refresh skill does NOT auto-promote. It only:

- Verifies the reference counts in the README are accurate
- Surfaces the "Promote Candidates" list for human review

The human decides what becomes a rule in `AGENTS.md`. The agent never writes to `AGENTS.md` directly.

## Discoverability Check

Verify `AGENTS.md` mentions `docs/learnings/` so future agents can find it. If not, the refresh can add a one-line mention (with user consent).

## What This Skill Does NOT Do

- **No automatic promotion to AGENTS.md** — you decide what becomes a rule
- **No parallel subagents** — single-pass review, no fan-out
- **No headless/automated mode** — interactive by design
```

- [ ] **Step 3: Verify the file was created**

Run: `ls -la .opencode/skills/compound-refresh/`
Expected: `-rw-r--r-- ... SKILL.md` showing the file exists

- [ ] **Step 4: Verify the file structure**

Run: `head -5 .opencode/skills/compound-refresh/SKILL.md`
Expected: First line is `---`, followed by `name: compound-refresh` and `description: Review and...`

- [ ] **Step 5: Commit**

```bash
git add .opencode/skills/compound-refresh/SKILL.md
git commit -m "feat(skills): add compound-refresh skill for learnings hygiene"
```

---

## Task 3: Add the AGENTS.md Discoverability Section

**Files:**

- Modify: `AGENTS.md` (add a new subsection under "Agent Behavior")

- [ ] **Step 1: Locate the insertion point**

The new "### Compound Learnings" subsection goes after the existing "### Keep Docs In Sync" subsection, before "## Tech Stack".

- [ ] **Step 2: Add the Compound Learnings subsection**

Edit `AGENTS.md`. Find the exact text (ending with the IMPLEMENTATION_STATUS.md note):

```
**Specifically for `docs/IMPLEMENTATION_STATUS.md`:** when you add, remove, or significantly change a feature/route/file, update the matching entry in the same commit — add new files to the right subsection, move resolved gaps to "Recently resolved", and bump the "Last updated" date at the top. If a sweep is overdue, run a fresh inventory check before editing.
```

Replace it with the above text **plus** the new subsection appended directly after:

```
### Compound Learnings

`docs/learnings/` holds durable lessons captured by the `compound` skill — bug fixes, design decisions, non-obvious workarounds. Each learning is a standalone markdown file with YAML frontmatter, organized by category.

**Before non-trivial work:** read `docs/learnings/README.md` (the index) and check entries with relevant tags. If a learning's tag matches your current task, read the full file and apply the lesson. When you apply an existing learning, increment its `## References` count (the `compound` skill will surface the increment for you).

**When to write a new learning:** invoke the `compound` skill after any of these:
- **After any `systematic-debugging` session resolves a bug, invoke `compound` before moving on to the next task** (this is the primary trigger)
- Fixed a non-trivial bug (outside of formal debugging)
- Solved a tricky problem that took more than one attempt
- Discovered a non-obvious workaround for a library, framework, or Discord.js quirk
- Resolved a design decision with surprising rationale

**Promotion:** the `compound` skill surfaces lessons referenced 3+ times in `docs/learnings/README.md` → "## Promote Candidates". Review weekly. If a lesson deserves a spot in this file as a project-wide rule, copy its core directive here. The agent never writes to AGENTS.md directly.

**Hygiene:** run the `compound-refresh` skill monthly (or after major refactors) to detect stale references, duplicates, and obsolete docs.

**Session-end check:** if this session produced a durable lesson and `compound` was not invoked during the work, invoke it before ending.
```

- [ ] **Step 3: Verify the insertion**

Run: `grep -n "### Compound Learnings" AGENTS.md`
Expected: A line number where "### Compound Learnings" appears, after the "### Keep Docs In Sync" line and before the "## Tech Stack" line.

- [ ] **Step 4: Verify the section is well-formed**

Run: `sed -n '/### Compound Learnings/,/^## Tech Stack/p' AGENTS.md | head -40`
Expected: The full "Compound Learnings" subsection ending right before "## Tech Stack", including the bold post-debugging trigger.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add Compound Learnings subsection for memory layer"
```

---

## Task 4: Create the Initial `docs/learnings/` README Scaffold

**Files:**

- Create: `docs/learnings/README.md`

This file is created up-front (not on first write) so the structure is documented from day 1. The `compound` skill will append to it.

- [ ] **Step 1: Create the directory**

```bash
mkdir -p docs/learnings
```

- [ ] **Step 2: Write the initial README.md**

Write the file `docs/learnings/README.md` with the following content:

```markdown
# Learnings Index

Indexed catalog of durable lessons captured by the `compound` skill. Read at session start; check entries with relevant tags before non-trivial work.

## Categories

Lessons are organized by category. Use the category directory closest to the problem area.

- `build-errors/` — TypeScript, Vite, pnpm, bundler
- `test-failures/` — Vitest, mocks, assertions
- `runtime-errors/` — Production crashes, unhandled rejections
- `database-issues/` — Drizzle, PostgreSQL, JSONB, migrations
- `permissions/` — Discord permission bits, role hierarchy, overwrites
- `bot-lifecycle/` — Discord.js cache, events, reconnection
- `auth/` — Better Auth, OAuth, sessions
- `integration-issues/` — Hono routes, SSE, middleware
- `logic-errors/` — Diff engine, execution engine, planning session
- `architecture-patterns/` — Project structure, module boundaries
- `design-patterns/` — Reusable non-architectural patterns
- `conventions/` — Team-agreed way of doing something
- `tooling-decisions/` — Library or tool choices with durable rationale
- `best-practices/` — Fallback only when no narrower category applies

## Pending Terms

Domain-specific terms flagged for `CONCEPTS.md` (project vocabulary glossary). When this list has 5+ terms, bootstrap `CONCEPTS.md` at repo root.

_(no pending terms yet)_

## Promote Candidates

Lessons referenced 3+ times. Review weekly — if a lesson deserves a spot in `AGENTS.md` as a project-wide rule, copy its core directive there and add `[PROMOTED]` to the learning's title.

_(no promote candidates yet)_

## <Category Name>/

_(no learnings yet — the `compound` skill will append entries here)_
```

- [ ] **Step 3: Verify the file**

Run: `ls -la docs/learnings/` and `head -10 docs/learnings/README.md`
Expected: README.md exists, first heading is "# Learnings Index".

- [ ] **Step 4: Commit**

```bash
git add docs/learnings/README.md
git commit -m "docs(learnings): add initial index scaffold with categories and sections"
```

---

## Task 5: Verify the Full System

**Files:** None (verification only)

- [ ] **Step 1: Verify all skills are discoverable**

Run: `ls -la .opencode/skills/`
Expected: Four directories: `classifying-codebase-problems/`, `compound/`, `compound-refresh/`, `frontend-design/`

- [ ] **Step 2: Verify skill frontmatter is valid**

For each of the two new skills, run:

```bash
head -4 .opencode/skills/compound/SKILL.md
head -4 .opencode/skills/compound-refresh/SKILL.md
```

Expected output for `compound`:

```
---
name: compound
description: Use after fixing a non-trivial bug...
---
```

Expected output for `compound-refresh`:

```
---
name: compound-refresh
description: Review and clean up docs/learnings/...
---
```

- [ ] **Step 3: Verify AGENTS.md is well-formed**

Run: `grep -A 1 "### Compound Learnings" AGENTS.md | head -3`
Expected: The "### Compound Learnings" heading appears, followed by the description.

- [ ] **Step 4: Verify the post-debugging trigger is in AGENTS.md**

Run: `grep -A 1 "After any .systematic-debugging." AGENTS.md`
Expected: A bullet with the bold post-debugging trigger matching the exact text in Task 3.

- [ ] **Step 5: Verify docs/learnings/ structure**

Run: `ls -la docs/learnings/`
Expected: `README.md` exists, no other files yet (compound skill will add them).

- [ ] **Step 6: Smoke-test the skill loading**

Open a new OpenCode session in this project and check that the `compound` and `compound-refresh` skills appear in the available skills list. If they don't, restart OpenCode to refresh the skill cache.

- [ ] **Step 7: No IMPLEMENTATION_STATUS.md entry needed**

This is project config (skills + docs), not a runtime subsystem. `IMPLEMENTATION_STATUS.md` does not need a new entry. (Existing `Last updated` date can stay as-is since no runtime subsystem changed.)

---

## Task 6: (Optional) Add a First Learning as Smoke Test

**Files:**

- Create: `docs/learnings/<category>/<some-slug>.md`
- Modify: `docs/learnings/README.md`

This is a smoke test to confirm the system works end-to-end. Skip if you don't have a real bug fix or design decision to document right now.

- [ ] **Step 1: Identify a real lesson to document**

Pick something from your recent work — a bug you fixed, a workaround you discovered, a design decision you made. If nothing fits, skip this task.

- [ ] **Step 2: Choose the category and slug**

Map the lesson to one of the categories in the README. Choose a kebab-case slug (3-6 words).

- [ ] **Step 3: Write the learning**

Use the `compound` skill's format (bug or knowledge track). Include real file paths with `file:line` references. End with `## References\n\n0`.

- [ ] **Step 4: Update the README index**

Add a bullet in the relevant category section of `docs/learnings/README.md`. Add a "## <category>/" header if the category doesn't have one yet.

- [ ] **Step 5: Commit**

```bash
git add docs/learnings/
git commit -m "docs(learnings): add first learning as smoke test"
```

---

## Self-Review

**Spec coverage:**

- Categorized storage ✓ (Task 1, Task 4)
- YAML frontmatter with two tracks ✓ (Task 1)
- Overlap detection ✓ (Task 1, "Workflow" step 1)
- Reference counting + Promote Candidates ✓ (Task 1, "Workflow" step 6 + frontmatter template)
- Discoverability Check ✓ (Task 1, "Workflow" step 5; Task 3)
- Auto-invoke trigger phrases ✓ (Task 1, frontmatter)
- Advisory preconditions ✓ (Task 1, "Preconditions" section)
- "Delete, don't archive" ✓ (Task 2)
- Quality gate (4 questions) ✓ (Task 1, "Quality Gate" section)
- Term surfacing with CONCEPTS.md bootstrap process ✓ (Task 1 step 4; Task 2; preamble specified)
- Refresh skill ✓ (Task 2)
- AGENTS.md directive with sharpened post-debugging trigger ✓ (Task 3)
- Skip + success + update outputs ✓ (Task 1, "Outputs" section)
- Convention compliance (Glob/Grep, not bash grep/ls) ✓ (Task 1, Task 2)

**Placeholder scan:** No "TBD" or "implement later" markers. All code blocks contain real content. No "similar to Task N" cross-references without full repetition.

**Type consistency:** Skill names (`compound`, `compound-refresh`) consistent across all tasks. Directory names (`docs/learnings/<category>/<slug>.md`) consistent. Frontmatter field names (`title`, `category`, `tags`, `date`, `last_updated`, `module`, `problem_type`) consistent. `## References` count mechanic consistent between Task 1 and Task 2.

**Task numbering:** Tasks renumbered after dropping Task 4 (systematic-debugging cross-reference). New order: 1=compound skill, 2=compound-refresh skill, 3=AGENTS.md edit, 4=README scaffold, 5=verify, 6=optional smoke test.
