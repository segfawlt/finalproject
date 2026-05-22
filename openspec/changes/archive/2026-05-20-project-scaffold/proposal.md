## Why

The project currently has no codebase — only a design document. Before any feature work (LLM planning, execution engine, Studio UI) can begin, the foundational infrastructure must be in place: a working monorepo, database schema, authentication, and application shells. This change establishes the plumbing that every subsequent feature depends on.

## What Changes

- **Monorepo structure** initialized with pnpm workspaces: `apps/web`, `apps/server`, `apps/docs`, `packages/shared`, `packages/db`
- **Shared TypeScript configuration** across all packages with strict mode
- **Database schema** defined via Drizzle ORM with core tables (users, guilds, plans, snapshots, rules, templates)
- **Authentication** via Better Auth with Discord OAuth2, session management, and permission guards
- **Hono API shell** with auth middleware, health check, and SSE streaming endpoint skeleton
- **Discord.js bot skeleton** with Gateway connection, heartbeat, intents, and in-memory cache structure
- **Vite + React web shell** with React Router, Tailwind CSS (Discord-like theme), Zustand stores, and route structure (Studio, Dashboard, Setup)
- **Development tooling**: ESLint, Prettier, Docker Compose for PostgreSQL

## Capabilities

### New Capabilities

- `monorepo-setup`: pnpm workspace structure, shared TypeScript config, linting, Docker Compose for local PostgreSQL
- `database-schema`: Drizzle ORM schema and migrations for core tables (users, guilds, plans, snapshots, rules, templates)
- `authentication`: Better Auth with Discord OAuth2, session middleware, guild-level permission guards
- `app-shell`: Hono API + Discord.js bot + Vite React web app skeletons with routing, theming, and state management foundations

### Modified Capabilities

<!-- No existing specs to modify — this is the first change -->

## Impact

- Creates the entire project directory structure from scratch
- Introduces dependencies: pnpm, TypeScript, Hono, Discord.js, Drizzle ORM, Better Auth, Vite, React, Tailwind CSS, Zustand, React Router
- Requires a local PostgreSQL instance (via Docker Compose) for development
- Establishes coding conventions (strict TypeScript, ESLint rules, Prettier config) that all future work will follow
- No breaking changes — this is the initial codebase
