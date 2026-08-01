---
title: Drift must be emitted when Discord gateway updates arrive
category: logic-errors
module: apps/server/src/bot/index.ts
tags: [discord, drift, gateway, sse]
problem_type: design-decision
date: 2026-08-01
---

# Drift Must Be Emitted on Gateway Edits

## Context

The periodic drift detector compared the application cache with the Discord.js
guild cache. A normal channel edit updates both caches through the same gateway
event, so the comparison remained equal and the Studio drift SSE never notified
the user.

## Guidance

Emit a `DriftEvent` from the Discord channel-update handler when relevant fields
change, after synchronizing the application cache. Keep the periodic comparator
for missed or inconsistent cache updates, but do not rely on it to identify
ordinary externally observed edits.

## Why This Matters

The browser can only show a drift indicator when an event reaches the guild drift
SSE subscribers. The event handler is the first reliable point at which the bot
observes a channel mutation; waiting for a later comparison loses the distinction
because the live and application caches have already converged.

## When to Apply

Use this pattern for Discord resource updates that are surfaced as external
drift. Add focused end-to-end coverage that subscribes to SSE before editing the
resource in Discord.

## References

2
