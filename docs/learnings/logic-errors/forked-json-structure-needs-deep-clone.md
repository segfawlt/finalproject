---
title: Forked JSON structures need deep cloning
category: logic-errors
module: apps/server/src/templates/template-version-service
tags: [templates, json, fork, mutation-isolation]
problem_type: logic-error
date: 2026-08-12
---

# Forked JSON Structures Need Deep Cloning

## Problem

Normalizing a JSON structure creates a new outer object but can retain nested object references. A template fork can therefore share mutable nested state with its source or immutable version snapshot.

## Solution

Deep-clone the normalized structure before inserting fork materialized state and its initial version snapshot. Test mutation of a nested property after the fork and assert both source and snapshot remain unchanged.

## Why This Works

Template structures are JSON-compatible data, so `structuredClone` prevents nested aliasing while preserving the declarative shape.

## References

0
