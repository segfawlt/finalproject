# Discord Platform — Project Overview

AI-driven Discord server management platform. Administrators describe server configurations in natural language — the system plans, previews (via a Discord-like Studio UI), validates, and executes changes through a Discord bot.

**Declarative, plan-first architecture. Never imperative. Never blind.**

## Tech Stack

| Layer      | Technology                                    |
| ---------- | --------------------------------------------- |
| Frontend   | Vite + React, React Router v6, Zustand, Tailwind CSS |
| Backend    | Hono, Discord.js v14, Better Auth             |
| Database   | PostgreSQL, Drizzle ORM                       |
| AI         | Vercel AI SDK + OpenRouter                    |
| Real-time  | SSE (Server-Sent Events)                      |
| Language   | TypeScript                                    |
| Monorepo   | pnpm workspaces                               |

## Architecture

```
apps/
├── web/          Vite + React SPA (Studio + Dashboard)
├── server/       Hono API + Discord.js Bot (monolith)
└── docs/         Astro (Landing page + Documentation)
packages/
├── shared/       Tool registry, types, validation utilities
└── db/           Drizzle ORM schema, migrations
```

Key design documents live under [`docs/design/`](./docs/design/). Change management uses OpenSpec (`openspec/specs/`, `openspec/changes/`).

## Commands

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Start web app + server concurrently            |
| `pnpm lint`        | Run ESLint across all packages                 |
| `pnpm format`      | Format code with Prettier                      |
| `pnpm db:generate` | Generate Drizzle migration from schema changes |
| `pnpm db:migrate`  | Apply pending migrations                       |
| `pnpm db:studio`   | Open Drizzle Studio (database GUI)             |

## Code Style

Follow patterns in adjacent files. **Caution:** existing code predates these guidelines. If a pattern genuinely hurts maintainability or understandability, flag it — don't silently conform to broken conventions.

## Development Guidelines

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style. If existing patterns genuinely hurt maintainability, flag them — discuss before rewriting.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Verification

After making changes, run `pnpm lint`. Fix any failures. Only hand off when lint passes cleanly. For runtime behavior changes, verify with `pnpm dev`.

## References

- [ProjectDescription.md](./ProjectDescription.md) — Full project overview
- [docs/design/](./docs/design/) — System design documents
- [openspec/specs/](./openspec/specs/) — Formal capability specs
- [open-issues.md](./open-issues.md) — Resolved decisions and open questions
