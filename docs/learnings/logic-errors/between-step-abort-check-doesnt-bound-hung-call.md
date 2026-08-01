---
title: "Between-step abort checks don't bound a hung call inside a step"
category: logic-errors
module: planning/execution-engine
tags: [execution-engine, cancellation, timeout, abort-signal]
problem_type: runtime-error
date: 2026-07-26
---

# Between-step abort checks don't bound a hung call inside a step

## Problem

`executePlan` had a plan-level 5-minute execution timeout (`AbortSignal.timeout`
wired into an `AbortController` in `apps/server/src/hono/routes/plans.ts`), and
the execution loop checked `abortSignal?.aborted` at the top of each iteration.
This looked like a complete "stuck execution gets aborted after a limit"
guarantee (see NFR-9), but it wasn't: the check only fires *between* steps.

## Symptoms

No crash, no error — just silent risk. A single hung `dispatchStep` call (e.g.
a Discord.js API call that never resolves) blocks the `await` inside the retry
loop indefinitely. Control never returns to the top of the `for` loop, so the
abort check is never reached, and the 5-minute deadline never actually cuts
the execution off. The bug is invisible in tests unless you specifically mock
a tool call that never resolves and assert the plan still terminates.

## What Didn't Work

Assuming "there's a timeout constant, therefore stuck executions are bounded"
without tracing where `abortSignal.aborted` is actually read. The timeout
existed and was wired correctly at the boundary (route → AbortController →
`executePlan`) — the gap was entirely inside the loop's cancellation
granularity, not in the wiring.

## Solution

Add a **per-step** deadline that races the individual tool call itself against
both a `setTimeout` and the abort signal, instead of only polling the abort
flag between iterations:

```ts
// Before: abort only checked between steps
for (let i = 0; i < steps.length; i++) {
  if (abortSignal?.aborted) { /* ... */ }
  const result = await dispatchStep(step, ctx); // can hang forever
}

// After: abort/timeout can interrupt mid-step
const result = await dispatchWithDeadline(step, ctx, stepTimeoutMs, abortSignal);
```

`dispatchWithDeadline` (see the companion pattern learning
[[promise-race-for-uncancellable-api]]) races `dispatchStep` against a timer
and an abort listener, so either one ends the *wait*, even though the
underlying Discord.js call itself can't be cancelled.

## Why This Works

A deadline or abort signal only bounds what it can actually reach. If the
check is polled at a loop boundary, it bounds loop *iterations*, not whatever
runs *inside* one iteration. To bound a single long-running async call, the
race has to wrap that call directly, not the loop around it.

## Prevention

When adding a wall-clock deadline to a loop that awaits async work per
iteration, ask: "if iteration N never resolves, does anything still stop
this?" If the answer relies on a check that only runs between iterations, the
deadline doesn't actually bound iteration N.

```ts
it("interrupts a hung step when the abort signal fires mid-step", async () => {
  const mockCtx = {
    addRoleToMember: () => new Promise<void>(() => {}), // never resolves
  };
  const controller = new AbortController();
  setTimeout(() => controller.abort("User requested abort"), 5);
  const result = await executePlan({ /* ... */ abortSignal: controller.signal });
  expect(result.success).toBe(false);
});
```

## References

2
