---
title: "Combine message-matching and error subclasses for retry classification"
category: design-patterns
module: planning/execution-engine
tags: [error-handling, retry, classification, execution-engine]
problem_type: design-decision
date: 2026-07-26
---

# Combine message-matching and error subclasses for retry classification

## Context

`isTransientError` classifies failures by matching substrings in
`error.message` (`"timeout"`, `"etimedout"`, `"econnreset"`) or Discord HTTP
status codes (500/502/503/504), then feeds that into a retry-with-backoff
loop. Adding `dispatchWithDeadline` (see
[[promise-race-for-uncancellable-api]]) introduced two new failure modes —
step timeout and step abort — that needed opposite retry behavior: a timeout
should retry (it might just be a slow call), but an abort (user cancel or
plan-level deadline) must never retry and must go straight to rollback.

## Guidance

Reuse the existing string-matching classifier for the case that should behave
like the errors it already recognizes, but introduce a distinct `Error`
subclass for the case that needs different, unconditional behavior — and
check the subclass *before* the string-matching branch runs:

```ts
class StepTimeoutError extends Error {
  constructor(ms: number) {
    super(`Step timeout after ${ms}ms`); // message contains "timeout" on purpose
    this.name = "StepTimeoutError";
  }
}

class StepAbortedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "StepAbortedError";
  }
}

// in the retry loop:
catch (err) {
  lastError = err instanceof Error ? err : new Error(String(err));

  if (err instanceof StepAbortedError) {
    break; // terminal, never retried, regardless of message content
  }

  if (isTransientError(err) && attempt < MAX_RETRIES) {
    // StepTimeoutError falls in here via message matching — retried
    ...
  }
}
```

`StepTimeoutError`'s message is deliberately worded to contain `"timeout"` so
it slots into the existing `isTransientError` check with zero changes to that
function. `StepAbortedError` is checked structurally (`instanceof`) ahead of
the transient-error branch, so its retry behavior can never be accidentally
triggered by message wording, now or if someone later changes its message.

## Why This Matters

Two different questions were at risk of being conflated: "does this look like
a transient failure worth retrying?" (a fuzzy, message-based heuristic — fine
for that purpose) versus "must this failure never be retried, no matter what
it says?" (a hard invariant that should not depend on string content). Using
`instanceof` for the hard invariant and reserving message-matching for the
fuzzy heuristic keeps the two concerns from interfering with each other. If
`StepAbortedError`'s check were message-based too, a future edit to its
wording could silently make aborts retryable.

## When to Apply

When extending an existing message-based or code-based error classifier with
a new failure type:

- If the new failure should behave like an existing bucket (retryable,
  known, etc.), it's fine to shape its message/fields so it falls into the
  existing check — cheaper than touching the classifier.
- If the new failure has a hard behavioral requirement (must always /
  never retry, must always trigger a specific downstream action), give it its
  own `Error` subclass and check that structurally, ahead of the fuzzy checks,
  so the invariant can't be broken by unrelated message changes.

## Examples

`StepTimeoutError` → falls into `isTransientError` via message substring →
retried up to `MAX_RETRIES` with backoff, same as a raw ETIMEDOUT.
`StepAbortedError` → caught by `instanceof` before that branch even runs →
always terminal, immediate rollback, even though its message could
technically contain retry-suggestive words like "timed out" depending on the
abort reason string passed in.

## References

0
