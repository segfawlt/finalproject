---
title: "Promise.race to add a deadline to an API with no cancellation hook"
category: design-patterns
module: planning/execution-engine
tags: [promise-race, cancellation, abort-signal, discord.js]
problem_type: design-decision
date: 2026-07-26
---

# Promise.race to add a deadline to an API with no cancellation hook

## Context

`dispatchStep` in the execution engine calls Discord.js APIs (create channel,
edit role, etc.) that expose no `AbortSignal` parameter and no way to cancel
an in-flight request. We still needed a per-step deadline so a hung call
couldn't block the whole execution (see
[[between-step-abort-check-doesnt-bound-hung-call]]). The underlying promise
genuinely cannot be cancelled — so "cancellation" here has to mean something
narrower than actually stopping the work.

## Guidance

Race the call against a timer and (if applicable) an abort listener, and stop
*waiting* on the original promise rather than trying to cancel it. The loser
of the race is abandoned — it keeps running in the background and its
eventual resolution/rejection is simply ignored (and garbage collected once
nothing references it).

```ts
function dispatchWithDeadline(
  step: PlanStep,
  ctx: ExecuteContext,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      abortSignal?.removeEventListener("abort", onAbort);
      fn();
    };

    const timer = setTimeout(
      () => settle(() => reject(new StepTimeoutError(timeoutMs))),
      timeoutMs
    );
    const onAbort = () =>
      settle(() => reject(new StepAbortedError(String(abortSignal?.reason))));

    if (abortSignal?.aborted) return onAbort();
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    dispatchStep(step, ctx).then(
      (result) => settle(() => resolve(result)),
      (err) => settle(() => reject(err))
    );
  });
}
```

The `settled` guard is required: without it, both the timer/abort path and the
real promise's resolution could each call `resolve`/`reject`, and whichever
fires second is silently ignored by the Promise spec but the `clearTimeout` /
listener cleanup still needs to run exactly once.

## Why This Matters

You cannot make an uncancellable operation cancellable after the fact. What
you *can* do is stop the caller from waiting on it, which is what actually
matters for keeping an execution loop responsive to a deadline or user abort.
Callers that don't understand this distinction sometimes try to find a
"cancel" method on a library object that doesn't exist, or assume `AbortController`
alone solves it — `AbortController` only helps if the callee reads the signal
internally; when it doesn't, the race pattern is the fallback.

## When to Apply

- The async API you're calling has no native cancellation/abort parameter.
- You need to enforce a deadline or respond to an external abort signal on a
  per-call basis (not just per-batch or per-loop).
- Leaving the loser's promise to settle in the background is safe — i.e., it
  has no side effect you need to prevent (Discord.js calls here either
  succeed, in which case the resource still gets created and a later
  read/drift-check will pick it up, or they fail, in which case there's
  nothing to undo).

Do not apply this if abandoning the loser's promise could cause an unguarded
side effect that the rest of the system doesn't expect (e.g., a write that
nothing will ever reconcile). In that case the underlying API needs real
cancellation support, not just a race.

## Examples

Before this pattern existed, a hung `dispatchStep` call blocked the retry loop
indefinitely regardless of any timeout constant elsewhere in the system. After
wrapping it in `dispatchWithDeadline`, a hung call surfaces as a
`StepTimeoutError` within `stepTimeoutMs`, which the existing retry/backoff
logic can then classify and act on (see
[[error-subclass-vs-message-matching-for-retry-classification]]).

## References

1
