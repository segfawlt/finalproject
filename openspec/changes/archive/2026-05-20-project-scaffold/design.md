## Context

The project has no codebase yet — only a design document (`ProjectDescription.md`) and tracked open issues. All stack decisions are locked in: pnpm workspaces, Vite + React, Hono, Discord.js v14, PostgreSQL, Drizzle ORM, Better Auth, Tailwind CSS, Zustand, React Router v6. This change is the first implementation step: establishing the project skeleton that all future features build upon.

**Constraints:**

- Monolith backend: Hono API and Discord.js bot run in the same Node.js process
- Self-hosted PostgreSQL via Docker Compose for local development
- Web app is a client-side SPA (no SSR)
- Landing page + docs use Astro SSG (deferred to a later change — scaffold only)
- All TypeScript with strict mode

## Goals / Non-Goals

**Goals:**

- Working monorepo with pnpm workspaces and shared TypeScript config
- PostgreSQL database with Drizzle ORM schema and migration pipeline
- Better Auth with Discord OAuth2 login and session management
- Hono API that starts, serves health checks, and validates auth sessions
- Discord.js bot that connects to Gateway and maintains an in-memory cache shell
- Vite + React web app with routing, Tailwind (Discord theme), and Zustand stores
- Docker Compose for local PostgreSQL (one command to start dev environment)

**Non-Goals:**

- No LLM planning loop, tool registry, or execution engine (future changes)
- No Studio UI components (channel list, drag/drop, permission panels) — only route shells
- No Dashboard features beyond empty page with correct layout
- No Astro docs/landing page implementation — directory scaffold only
- No Cloudflare Tunnel setup — local development only
- No production deployment configuration

## Decisions

### 1. Monorepo Package Organization

**Decision:** Use `apps/` for runnable applications, `packages/` for shared libraries.

```
apps/
  web/          # Vite + React SPA (Studio + Dashboard)
  server/       # Hono API + Discord.js Bot (monolith)
  docs/         # Astro (scaffold only, empty)
packages/
  shared/       # Tool types, Zod schemas, constants, utilities
  db/           # Drizzle schema, migrations, database client
```

**Rationale:** Matches the structure defined in ProjectDescription.md. `shared` holds code used by both `web` and `server` (tool definitions, types, validation schemas). `db` is used by `server` and potentially `web` for type imports.

**Alternatives considered:**

- Flat structure (no workspaces): Rejected — too hard to share types between frontend and backend
- Separate repos: Rejected — adds deployment complexity for Phase 1

### 2. TypeScript Configuration Strategy

**Decision:** Shared base `tsconfig.json` in root, extended by each package with project-specific overrides.

```
tsconfig.base.json    # strict: true, target: ES2022, module: ESNext
apps/web/tsconfig.json     # extends ../../tsconfig.base.json, lib: ["DOM", "DOM.Iterable"]
apps/server/tsconfig.json  # extends ../../tsconfig.base.json, lib: ["ES2022"]
packages/db/tsconfig.json  # extends ../../tsconfig.base.json
packages/shared/tsconfig.json # extends ../../tsconfig.base.json
```

**Rationale:** Ensures consistent strictness across all packages while allowing DOM vs Node.js lib differences.

### 3. Database Schema Approach

**Decision:** Drizzle ORM with PostgreSQL dialect. Schema defined in `packages/db/src/schema.ts`, migrations generated via `drizzle-kit generate`, applied via `drizzle-kit migrate`.

**Core tables:**

- `users` — managed by Better Auth (id, name, email, discord_id, avatar, created_at)
- `guilds` — guild_id (PK), name, icon, server_type, settings (JSONB), created_at, updated_at
- `plans` — id (UUID, PK), guild_id (FK), user_id (FK), status, user_prompt, server_type, plan_data (JSONB), complexity_score (JSONB), created_at, updated_at, executed_at, completed_at
- `snapshots` — id (UUID, PK), type, guild_id (FK), plan_id (FK, nullable), data (JSONB), created_at, expires_at (nullable), metadata (JSONB)
- `rules` — id (UUID, PK), guild_id (FK), rule_text, created_at, updated_at
- `templates` — id (TEXT, PK), version, name, description, structure (JSONB), questions (JSONB), validation_rules (JSONB), category, tags (TEXT[]), author_id (FK, nullable), is_official, status, created_at, updated_at
- `role_snapshot_members` — id (UUID, PK), snapshot_id (FK), user_id, username

**Rationale:** The schema is fully specified in ProjectDescription.md sections 7.C and 7.E. Drizzle provides type-safe queries and straightforward migrations. JSONB columns for plan_data and snapshots avoid over-normalizing complex nested structures.

### 4. Better Auth Integration

**Decision:** Better Auth runs as Hono middleware in the `server` app. Discord OAuth2 provider configured via environment variables (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`). Session stored as HTTP-only cookie.

**Auth flow:**

1. User clicks "Login with Discord" in web app → redirects to `/api/auth/signin/discord`
2. Better Auth handles OAuth flow → Discord redirects back → session cookie set
3. Subsequent requests include cookie → Hono middleware validates and attaches user to request context
4. Guild access check: user must have `MANAGE_GUILD` permission in the target Discord guild

**Database tables:** Better Auth creates its own tables (`user`, `session`, `account`, `verification`) — we do not manage these directly.

**Rationale:** Better Auth is self-hosted, type-safe, and has first-party Discord OAuth2 support. No need for a separate auth service.

### 5. Hono + Discord.js Co-location

**Decision:** Both run in the same Node.js process. The Discord.js `Client` is instantiated once and exported as a singleton. Hono routes import the client directly for cache access and execution.

```
apps/server/src/
  index.ts          # Entry point — starts Hono server + Discord bot
  hono/             # Hono app, routes, middleware
  bot/              # Discord.js client, event handlers, cache
  auth/             # Better Auth config
  db/               # Database client (re-exports from packages/db)
```

**Rationale:** Eliminates inter-process communication for Phase 1. Direct function calls between API and bot. Bot cache is an in-memory import, not an HTTP endpoint.

### 6. Web App Structure

**Decision:** Single Vite + React SPA with React Router v6. Route structure:

```
/                    → Landing redirect (to /studio or login)
/studio              → Studio (Discord clone config UI)
/studio/:guildId     → Studio for specific guild
/dashboard           → Dashboard overview
/dashboard/:guildId  → Dashboard for specific guild
/setup               → First-time setup wizard
/setup/:guildId      → Setup for specific guild
```

**Zustand stores:**

- `useAuthStore` — current user, login/logout state
- `useStudioStore` — selected guild, UI state (panels, drag/drop, multi-select)
- `useDashboardStore` — dashboard UI state

**Tailwind theme:** Discord color palette (dark mode primary) via `tailwind.config.js` custom theme tokens.

**Rationale:** Single SPA is simpler than separate apps for Studio and Dashboard. Zustand is lightweight and sufficient for ~15 endpoints. Discord-like theme from day one ensures visual consistency.

### 7. Development Environment

**Decision:** Docker Compose for PostgreSQL only. Node.js runs natively on the developer's machine via `pnpm dev` (concurrently runs web + server).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: discord_platform
    volumes:
      - pgdata:/var/lib/postgresql/data
```

**Rationale:** Docker for PostgreSQL ensures consistent database version without local installation. Node.js runs natively for fast iteration and debugger support. No Docker for the app itself — too slow for development.

## Risks / Trade-offs

| Risk                                                                        | Mitigation                                                                                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Better Auth Discord OAuth2 may have edge cases with guild permission checks | Implement permission check as a separate middleware layer, test with multiple guild roles                                                                             |
| Drizzle JSONB columns lose type safety for nested plan data                 | Define Zod schemas in `packages/shared` for plan structure, validate on read/write                                                                                    |
| Co-located Hono + Discord.js makes it harder to split later                 | Clean module boundaries from day one — `apps/server/src/hono/` and `apps/server/src/bot/` should not import from each other directly, only through a shared interface |
| Tailwind Discord theme may drift from actual Discord UI                     | Use Discord's official color values as reference, update iteratively as Studio components are built                                                                   |
| Docker Compose PostgreSQL volume may grow unbounded during development      | Document `docker compose down -v` for clean resets, add backup script later                                                                                           |
