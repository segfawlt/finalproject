# AGENTS.md Improvement — Design Doc

**Date:** 2026-05-24
**Status:** approved

## Problem

The current `AGENTS.md` lacks concrete code conventions (it says "follow adjacent files" and "flag broken conventions" — hand-wavy). Key guardrails (grepai, testing, security) are poorly positioned. Missing sections: environment variables, PR conventions, testing strategy.

## Solution

Full rewrite using the **Convention-Driven** approach — each section gives a one-line rule followed by concrete examples drawn from the actual codebase. Descriptive (what the codebase does), not aspirational.

## Sections

1. **Title + Intro** — unchanged
2. **Tech Stack** — unchanged
3. **Architecture** — unchanged
4. **grepai** — moved from bottom to position 4; content preserved
5. **Code Conventions** — rewritten with concrete subsections: formatting, naming, exports, imports, error handling, TypeScript, React, Hono routes, database
6. **Commands** — unchanged
7. **Setup** — updated to reference new Env Vars section
8. **Environment Variables** — new; lists all vars from `.env.example` + note about `OPENROUTER_API_KEY` gap
9. **Database** — trimmed duplicate `db:*` commands; kept schema conventions
10. **Testing Strategy** — new; Vitest, per-package priorities, test conventions (no install)
11. **PR & Commit Conventions** — new; conventional commits, squash merge, branch naming
12. **References** — unchanged

## Design Decisions

- grepai at position 4 (after Architecture) for LLM priority weighting
- Testing as "strategy only" — no framework installation
- Conventional commits included despite LLMs knowing the format — project-specific convention must be explicit
- Security note inline in Env Vars section rather than separate security section
- All code convention examples verified against actual source files
