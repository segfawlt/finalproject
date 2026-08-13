---
title: Validate allowlist before catalog fetch
category: integration-issues
module: planning/deployment-model-config
tags: [openrouter, catalog, allowlist, model-config, fail-closed]
problem_type: runtime-error
date: 2026-08-12
---

# Validate Allowlist Before Catalog Fetch

## Problem

A conversation can retain a model ID after the deployment's two-model allowlist changes. Resolving
that stale selection by fetching OpenRouter metadata first sends unnecessary provider traffic before
the selection is rejected.

## Symptoms

Removing a configured model correctly blocks the next planning or policy-validation request, but the
server still performs a `GET /models` request to OpenRouter first.

## What Didn't Work

Validating the selected model only after catalog enrichment made the optional remote lookup part of
the enforcement path. Catalog metadata is useful for reasoning capabilities, but it is not the
authority for which models are enabled.

## Solution

Check the persisted allowlist immediately after loading it, before attempting a catalog lookup.

```ts
const modelIds = readPersistedModelIds(setting?.value);
if (selection && modelIds && !modelIds.includes(selection.modelId)) {
  throw new Error(`Model "${selection.modelId}" is not enabled for this deployment`);
}

const catalog = await getOpenRouterModels(...);
```

Continue to enrich allowed IDs with catalog metadata when it is available, and retain metadata-free
allowed IDs during catalog outages.

## Why This Works

The database allowlist is the authorization boundary. Checking it first fails stale selections
without provider traffic, while the catalog remains a best-effort source of display and reasoning
capabilities.

## Prevention

Test both boundaries: a removed selection must reject without calling the catalog client, and an
allowed persisted selection must still resolve when the catalog is unavailable.

## Related

- [Persisted models survive catalog failure](./persisted-models-survive-catalog-failure.md)

## References

0
