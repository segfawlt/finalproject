---
title: Discord role diffs must respect strict hierarchy
category: permissions
module: planning/diff-engine and planning/validation
tags: [discord, role-hierarchy, diff-engine, permissions]
problem_type: logic-error
date: 2026-07-29
---

# Discord Role Diffs Must Respect Strict Hierarchy

## Problem

The diff engine compared role permission arrays by reference. A desired-state fork and
the live Discord state therefore looked different even when they contained the same
permissions, producing unnecessary `edit_role` steps.

The validation layer also allowed a role at the bot's exact highest position because it
checked only `target.position > bot.position`. Discord requires the bot to be strictly
above a role it edits, moves, deletes, assigns, or removes.

## Symptoms

Channel-only plans generated edits for existing roles, including the bot's own role. The
channel creation succeeded, but the later role edit failed with Discord's `Missing
Permissions` error. Automatic rollback then encountered the same uneditable role.

## What Didn't Work

Granting `MANAGE_CHANNELS` and `ADMINISTRATOR` did not resolve the failure. Those
permissions do not bypass Discord role hierarchy, and a bot cannot edit its own highest
or managed integration role.

## Solution

Compare role permissions as an unordered set of names and reject hierarchy equality as
well as targets above the bot:

```ts
if (!arraysEqualSorted(role.permissions, realRole.permissions)) {
  editDiff.permissions = role.permissions;
}

if (role.position >= botPosition) {
  // block the plan before dispatching to Discord
}
```

The same strict boundary applies to member role assignment and removal.

## Why This Works

Desired-state and live-state permission arrays can be separate allocations and can have
different ordering, but Discord evaluates the permission names as a set. Structural set
comparison prevents no-op role requests. Strict hierarchy validation prevents requests
Discord will reject, while still allowing channel-only plans to run without requiring
the bot to modify any role.

## Prevention

Regression tests cover both sides of the boundary:

- Equal permission sets in different array orders emit no `edit_role` step.
- Editing a role at the bot position is blocked.
- Assigning a role at the bot position is blocked.

## References

1
