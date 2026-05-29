# Architecture Overview

## Project Goal

An AI-driven management platform that allows Discord Administrators to configure complex server environments using natural language, featuring a real-time "Dry Run" preview and safety-first validation layers.

**Declarative, plan-first.** Administrators describe what they want, the system plans it, previews it in a Discord-like Studio UI, and executes only after human approval. Never imperative. Never blind.

---

## Tech Stack

| Layer        | Technology               | Purpose                                               |
| ------------ | ------------------------ | ----------------------------------------------------- |
| Web App      | Vite + React (SPA)       | Studio (Discord Clone Config UI) + Dashboard          |
| Routing      | React Router v7          | Client-side routing with nested layouts               |
| State        | Zustand                  | Global UI state (Studio drag/drop, panels, execution) |
| Styling      | Tailwind CSS             | Discord dark theme                                    |
| Backend/API  | Node.js / Hono           | High-performance orchestration (co-located with Bot)  |
| Real-time    | SSE via `hono/streaming` | Live execution status to frontend                     |
| Orchestrator | OpenRouter (raw fetch)   | LLM-based planning via constrained tool-calling       |
| Database     | PostgreSQL + Drizzle ORM | Plans, snapshots, rules, templates, users             |
| Auth         | Better Auth              | Discord OAuth2, session management, multi-tenant      |
| Bot          | Discord.js v14           | Stateful Bot Worker (same process as Hono)            |
| Tunnel       | Cloudflare Tunnel        | Secure internet exposure, no port forwarding          |

---

## Architecture Decision: Monolith Backend

- Hono API and Discord.js Bot run in the **same Node.js process**
- Direct function calls between API and Bot — no pub/sub for Phase 1
- Bot cache is an in-memory import, not an HTTP endpoint
- No serverless timeout constraints (LLM planning can take 30-60s)
- Phase 2: Can split into separate processes with Redis/PG NOTIFY if needed

## Architecture Decision: SSE over Polling

- Frontend receives live execution status via SSE (`GET /api/plan/:id/stream`)
- Single persistent connection, near-zero overhead, instant updates
- Browser auto-reconnects on drop — no custom retry logic needed

---

## Project Structure

```
├── apps/
│   ├── web/          # Vite + React SPA (Studio + Dashboard)
│   ├── docs/         # Astro SSG (Landing + Documentation, deferred)
│   └── server/       # Hono API + Discord.js Bot (monolith)
├── packages/
│   ├── shared/       # Domain types, tool schemas, state, constants
│   └── db/           # Drizzle ORM schema, migrations, DB client
└── docs/
    └── design/       # System design documentation (these files)
```

---

## Deployment

| Component              | Where                     | Cost      |
| ---------------------- | ------------------------- | --------- |
| Web App (static SPA)   | Cloudflare Pages / Vercel | $0        |
| Landing + Docs (Astro) | Cloudflare Pages / Vercel | $0        |
| Backend (Hono + Bot)   | User's PC or VPS          | ~$5-20/mo |
| Database (PostgreSQL)  | Same machine as backend   | $0        |
| Cloudflare Tunnel      | Free tier                 | $0        |
| LLM API (OpenRouter)   | Pay-per-use               | ~$5-20/mo |

The Bot Worker requires a persistent WebSocket connection — cannot run on serverless. Co-locating with Hono eliminates inter-process complexity. Self-hosting PostgreSQL avoids managed DB costs.

---

## The 6-Phase Flow

```
Phase 1: INTAKE
  User prompt → identify guild, check permissions, read bot cache, fork desired state

Phase 2: PLANNING (LLM tool calls)
  LLM modifies desired state via 14 registered tools
  Tool calls streamed to frontend as they complete (thinking collapsed, tools visible)
  Clone re-renders live as desired state changes
  ask_user pauses loop for clarification

Phase 3: ITERATION (optional)
  User reviews clone → Approve, Revise, manual edits, or Revert to past iteration
  Templates can be added to context as ideas for the LLM

Phase 4: APPROVAL
  Diff engine: desired vs real → minimal execution steps
  Stage 1 validation (5 groups: code-based, includes bot role hierarchy + ADMINISTRATOR)
  Stage 2 validation (LLM policy check)
  Acquire guild lock

Phase 5: EXECUTION
  Symbol resolver → Discord API calls
  SSE stream to frontend (live clone updates)
  Retry on transient errors, hardcoded diagnosis on known errors
  Full rollback on permanent failure via tracked Discord IDs
  No LLM involvement in execution error handling

Phase 6: POST-EXECUTION
  Capture after-snapshot, store plan in PostgreSQL
  Release guild lock
  Show execution history with [Rollback]
```

---

## What Was Removed from Original Design

- ~~Vector Store~~ — Server rules fit in context, no RAG needed
- ~~Shadow State~~ — Bot cache + snapshots sufficient
- ~~Server Clone (Discord Sandbox)~~ — Deferred. Studio Web Clone is primary preview
- ~~Next.js~~ — Vite + React SPA, no SSR/SEO needed for the app
- ~~Separate backend process~~ — Co-located with Bot Worker
- ~~Complexity Scorer~~ — Single Plan Mode eliminates need
- ~~Two Execution Modes~~ — Consolidated into single Plan Mode
