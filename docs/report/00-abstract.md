# Abstract

Discord gives community administrators fine-grained control over channels, roles,
members, and permissions, but substantial configuration changes require many
interdependent actions and can expose a live community to permission mistakes or
partial failure. This project designed and implemented an AI-assisted Discord
management platform in which an administrator describes a desired outcome in
natural language while deterministic software retains authority over execution.

The platform uses a declarative, plan-first workflow. A large language model can
modify only an isolated desired-state representation through registered tools. The
system then derives an ordered difference from the observed guild state, applies
structural and server-rule validation, presents a Discord-like preview, and
requires explicit approval before a bot can mutate Discord. Per-guild locking,
stale-state hashes, bounded retry and execution, persisted snapshots,
best-effort structural rollback, drift detection, and Server-Sent Events support
the safety and operational lifecycle. The implementation uses a TypeScript
monorepo with React, Hono, Discord.js, PostgreSQL, Drizzle ORM, and an
OpenAI-compatible model interface. It was developed iteratively, with the
highest-risk boundaries addressed before broader interface features.

Evaluation combined automated component tests, Playwright system tests, code
inspection, and recorded live Discord observations. All 208 collected Vitest
cases across 27 files passed. The browser runner reported 45 passing and eight
skipped assertions; when assessed against the 20 complete acceptance-case
specifications, however, the results were two pass, fourteen partial, one fail,
and three skipped. Live observations demonstrated stale-plan execution rejection,
guild-scoped drift notification, and authenticated stream readiness. The measured
p95 read latency was 2072 ms and therefore failed the declared one-second target.
Controlled multi-step execution, failure-injected rollback, active cancellation,
restart recovery, provider compatibility, deployment, and user-comprehension
evaluation remain incomplete.

The project demonstrates that natural-language convenience can be separated from
privileged Discord mutation through a reviewable declarative control plane. Its
strongest evidence concerns the deterministic planning and safety core; broader
black-box and live evaluation is required before claiming full satisfaction of
the complete requirement set.
