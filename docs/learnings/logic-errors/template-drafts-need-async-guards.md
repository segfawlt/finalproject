---
title: Template drafts need async guards
category: logic-errors
module: apps/web/src/routes/TemplateStudio.tsx
tags: [templates, drafts, navigation, sse]
problem_type: runtime-error
date: 2026-08-12
---

# Template Drafts Need Async Guards

## Problem

Template structure edits live in the preview component, while navigation and AI refreshes are
owned by the route. A dirty boolean alone cannot save the working structure before another action
replaces it.

## Solution

Expose the current draft snapshot to the route, and make every action that can replace or leave the
draft pass through one asynchronous save/discard/stay guard. Authoring SSE terminal paths should
also share cleanup and refetch persisted turns, including cancellation and provider errors.

## Why This Works

The route can commit the exact local structure as one manual version before continuing. Refreshes
and navigation therefore cannot silently overwrite client-only edits, while terminal authoring
status is reconciled with durable turn state.

## Prevention

Test the actual draft snapshot passed to the parent, guarded sidebar navigation, and cancellation
and error SSE events asserting both cleared active state and refetched turns.

## References

3
