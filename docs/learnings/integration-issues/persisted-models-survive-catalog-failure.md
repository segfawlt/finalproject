---
title: Persisted models survive catalog failure
category: integration-issues
module: hono/routes/conversations
tags: [openrouter, catalog, model-config, fallback]
problem_type: design-decision
date: 2026-08-12
---

# Persisted Models Survive Catalog Failure

## Context

Conversation creation combines the deployment's persisted OpenRouter model allowlist with a
best-effort in-memory catalog that supplies reasoning metadata.

## Guidance

When the catalog is unavailable, retain the persisted model IDs and drop only metadata that cannot
be verified. Fall back to `LLM_MODEL` only when no usable persisted allowlist exists.

```ts
const models = persistedIds.map((id) => catalogById.get(id) ?? { id });
```

## Why This Matters

Treating a temporary catalog failure as an absent deployment setting silently changes the selected
model. The persisted allowlist remains the authoritative configuration; catalog data enriches it.

## When to Apply

Apply this when persisted configuration references a remotely cached metadata catalog, especially
when the metadata source is optional at request time.

## Related

- [Validate allowlist before catalog fetch](./validate-allowlist-before-catalog-fetch.md)

## References

0
