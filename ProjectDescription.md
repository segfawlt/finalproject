# Discord Platform — Project Description

AI-driven Discord server management platform. Administrators describe server configurations in natural language — the system plans, previews (via a Discord-like Studio UI), validates, and executes changes through a Discord bot.

**Declarative, plan-first architecture.** Never imperative. Never blind.

## Design Docs

System design is documented in focused files under [`docs/design/`](./docs/design/):

| #   | File                                                                               | Covers                                                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | [overview.md](./docs/design/overview.md)                                           | Tech stack, project structure, deployment, 6-phase flow             |
| 2   | [desired-state-and-diff-engine.md](./docs/design/desired-state-and-diff-engine.md) | DesiredState + tombstones, diff engine, 4-layer prevention stack    |
| 3   | [planning-and-execution.md](./docs/design/planning-and-execution.md)               | Planning loop, tool calling, ask_user, symbol resolution, execution |
| 4   | [validation-and-safety.md](./docs/design/validation-and-safety.md)                 | Stage 1/2 validation, safety guards                                 |
| 5   | [studio-and-dashboard.md](./docs/design/studio-and-dashboard.md)                   | Studio architecture, iteration history, dashboard                   |
| 6   | [template-system.md](./docs/design/template-system.md)                             | Templates, guidance system, template authoring                      |
| 7   | [plan-storage.md](./docs/design/plan-storage.md)                                   | Plan JSON, snapshots, rollback, error handling                      |
| 8   | [security.md](./docs/design/security.md)                                           | Bot requirements, auth, locking, pre-execution checks               |

## Other References

- [docs/issues/open-design-issues.md](./docs/issues/open-design-issues.md) — Resolved design decisions and still-open questions
- Superpowers skills — Development workflows (brainstorming, TDD, debugging, etc.)

## Quick Start

```bash
pnpm install
pnpm dev          # starts web (5173) + server (3001)
pnpm db:migrate   # apply database migrations
pnpm lint
```
