---
title: Execution mode is not interaction mode
category: logic-errors
module: planning/planning-session
tags: [planning-session, tool-registry, execution-mode, ask-user]
problem_type: logic-error
date: 2026-07-29
---

# Execution Mode Is Not Interaction Mode

## Problem

The planning session used a tool's `executionMode` to decide whether the tool
should pause the LLM loop for user input. That field only describes whether a
tool may be dispatched during execution; it does not describe how planning
should continue after the tool runs.

## Symptoms

Calling `batch_set_overwrite` applied the requested changes to `DesiredState`,
then incorrectly changed the session status to `waiting_for_user` and emitted
an `ask_user` event whose question was `undefined`.

## What Didn't Work

Treating every `planning_only` tool as interactive appeared reasonable while
`ask_user` was the only tool in that category. It became incorrect as soon as
`batch_set_overwrite` shared the category for a different reason. Renaming the
category or only correcting documentation would leave the control-flow bug in
place.

## Solution

Use the specific interaction tool as the pause discriminator while retaining
`executionMode` for execution eligibility:

```ts
// Before
if (tool.executionMode === "planning_only") {
  return { type: "ask_user", question: params.question };
}

// After
if (toolName === "ask_user") {
  return { type: "ask_user", question: params.question };
}
```

`batch_set_overwrite` now returns a normal planning result, so the loop can
continue and the later diff can emit executable `set_overwrite` steps.

## Why This Works

Execution eligibility and planning-loop behavior are separate concerns. The
registry's `planning_only` value prevents both tools from reaching the Discord
execution engine, while the explicit `ask_user` check limits the pause behavior
to the only tool whose contract requires user input.

## Prevention

Exercise planning-only tools through the public session loop. A regression test
should stream a `batch_set_overwrite` call, assert that no `ask_user` event is
emitted, and verify that the session continues to a later completion response.
If another interactive tool is introduced, represent interaction explicitly
rather than inferring it from execution eligibility.

## References

1
