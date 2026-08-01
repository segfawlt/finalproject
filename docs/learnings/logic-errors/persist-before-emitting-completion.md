---
title: Persist before emitting completion
category: logic-errors
module: planning/planning-session
tags: [planning-session, persistence, sse, completion-ordering]
problem_type: logic-error
date: 2026-08-01
---

# Persist Before Emitting Completion

## Problem

The planning session could emit a terminal `completed` SSE event before its
finished state had been saved. The persistence callback also swallowed its own
failure, allowing the browser to show a successful plan that was unavailable
from durable storage.

## Symptoms

A client could receive `completed` and proceed to review while the database
still contained an older iteration or no completed plan. Refreshing the page or
restarting the server then contradicted the successful live event.

## What Didn't Work

Logging and ignoring a persistence error kept the live planning loop responsive,
but split the authoritative result between memory and PostgreSQL. Retrying only
in the browser could not repair that missing durable state.

## Solution

Treat persistence as part of the terminal state transition. Await the completion
callback first, and emit `completed` only after it succeeds:

```ts
await this.onTurnComplete?.(result);
this.emit({ type: "completed", ...result });
```

If persistence fails, let the error reach the session's normal error path so the
client receives `error` and never receives `completed`.

## Why This Works

The durable record becomes authoritative before observers are told that the
operation succeeded. Once a client sees the terminal success event, a refresh,
reconnect, or process restart can recover the same completed state.

## Prevention

For every terminal event backed by durable state, test the failure ordering:

```ts
it("does not emit completed when persistence fails", async () => {
  await expect(session.start()).rejects.toThrow("persistence failed");
  expect(events.some((event) => event.type === "completed")).toBe(false);
  expect(events.some((event) => event.type === "error")).toBe(true);
});
```

Apply the same rule to future approval, execution, or rollback transitions:
commit the authoritative state first, then announce success.

## References

1
