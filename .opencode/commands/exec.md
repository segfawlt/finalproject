---
description: Execute a plan at the given path using executing-plans skill
---
Use the executing-plans skill to implement the plan at $1.

Commit permission:
The plan includes commit steps per task. My instruction to execute
this plan is explicit approval to commit — execute the commit steps
as written.

Per-task self-check (do this BEFORE marking each task complete):
1. Run the verification command from the plan's last step.
2. If the actual output matches the plan's "Expected:" line → proceed to step 3.
   If it does NOT match → attempt ONE fix:
   a. Read the error.
   b. Form one hypothesis.
   c. Make one change to address it.
   d. Re-run the verification.
   e. If pass → log the fix (see "Fixes Applied" below), proceed to step 3.
      If fail → produce a STOP Report (format below) and STOP. Do not
      attempt a second fix.
3. Run `git diff HEAD~1 --stat`. Compare changed files to the task's
   "Files:" section. Divergence = any of:
   - A file in the Files section was NOT changed
   - A file NOT in the Files section WAS changed
   - Changes outside the line ranges in any Modify entry
   - Reformatting, import reordering, or whitespace on lines not in
     the Modify ranges
4. If divergence → produce a STOP Report and STOP. Do not proceed to
   the next task.

Fixes Applied:
After a successful fix, log it:
  Fix Applied — Task N, Step M: <what failed> → <what you changed>
At the end of execution (or when STOPping), include a
"## Fixes Applied" section with all logged fixes.

STOP Report format:
## STOP Report
- Task: N (title)
- Step: M
- Command: <command run>
- Expected (from plan): <expected output>
- Actual: <actual output>
- Fix attempted: <what you changed> (omit if divergence, not test failure)
- Result of fix: <pass/fail> (omit if divergence, not test failure)
- My hypothesis: <what you think is wrong>

Surgical changes:
Touch only what each step's code block shows. No refactoring, no
formatting fixes, no "while I'm here" improvements, no extra features.
If you see something that looks like it should be fixed and it's not
in the step, note it and keep going — do not fix it. Doc updates
required by the plan are part of the surgical change, not adjacent
improvements.

Complex tasks:
If a task is prefixed "[COMPLEX]", complete it if you can, but if
you hit any uncertainty during it, STOP immediately rather than
guessing. Do not attempt a fix on COMPLEX tasks — report only.
