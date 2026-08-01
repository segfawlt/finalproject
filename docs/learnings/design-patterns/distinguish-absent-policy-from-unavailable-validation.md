---
title: Distinguish absent policy from unavailable validation
category: design-patterns
module: planning/validation
tags: [fail-closed, policy-validation, llm, availability]
problem_type: design-decision
date: 2026-07-31
---

# Distinguish Absent Policy from Unavailable Validation

## Context

Policy validation is optional per guild, but it depends on an external LLM when rules are
configured. An early return based only on a missing API key conflates two different states:
the guild has no policy to enforce, or the system cannot evaluate a policy that does exist.

## Guidance

Load the applicable policy before checking whether the external validator is available:

```ts
const rules = await loadGuildRules(guildId);
if (rules.length === 0) return [];
if (!apiKey) return [policyUnavailable("LLM_API_KEY is not configured")];
```

Once a policy exists, treat every inability to evaluate it as a blocking validation issue:
rule-loading failures, missing provider configuration, non-success responses, timeouts,
empty responses, and malformed response data. Validate the provider's response shape
strictly instead of accepting partial or unknown values.

## Why This Matters

An unavailable checker does not prove that a privileged change complies with configured
rules. Treating provider failure as success silently bypasses the administrator's policy.
Keeping the no-policy case separate preserves optional configuration without weakening
configured enforcement.

## When to Apply

Use this pattern when validation is optional for each tenant or resource, but mandatory once
a policy exists, especially when evaluation depends on a database query or external service.

## Examples

- No configured rules: skip policy validation and continue with deterministic checks.
- Configured rules and a valid empty violation list: continue.
- Configured rules and an unavailable or malformed validator response: add a blocker and do
  not execute the plan.

## References

1
