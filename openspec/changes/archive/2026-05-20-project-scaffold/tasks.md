## 1. Monorepo Infrastructure

- [x] 1.1 Initialize pnpm workspace with `pnpm-workspace.yaml` declaring all 5 packages
- [x] 1.2 Create `tsconfig.base.json` with strict mode, ES2022 target, ESNext modules
- [x] 1.3 Create `apps/web/tsconfig.json` extending base with DOM lib
- [x] 1.4 Create `apps/server/tsconfig.json` extending base with Node.js types
- [x] 1.5 Create `packages/shared/tsconfig.json` extending base
- [x] 1.6 Create `packages/db/tsconfig.json` extending base
- [x] 1.7 Create root `package.json` with workspaces config and root scripts (dev, lint, format, db:generate, db:migrate)
- [x] 1.8 Install and configure ESLint at root with TypeScript parser
- [x] 1.9 Install and configure Prettier at root
- [x] 1.10 Create `.env.example` at root with all shared variables (DATABASE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN)
- [x] 1.11 Update `.gitignore` to exclude `.env`, `node_modules`, `dist`, `.turbo`
- [x] 1.12 Create `docker-compose.yml` with PostgreSQL 16 Alpine service

## 2. Database Schema (packages/db)

- [x] 2.1 Install Drizzle ORM, drizzle-kit, and PostgreSQL driver in `packages/db`
- [x] 2.2 Configure `drizzle.config.ts` with database connection and migrations output path
- [x] 2.3 Create `packages/db/src/schema.ts` with all table definitions (users, guilds, plans, snapshots, rules, templates, role_snapshot_members)
- [x] 2.4 Define Drizzle relations between tables (plans → guilds, plans → users, snapshots → guilds, snapshots → plans, rules → guilds, templates → users, role_snapshot_members → snapshots)
- [x] 2.5 Create `packages/db/src/index.ts` exporting schema, relations, and database client
- [x] 2.6 Create `packages/db/package.json` with proper exports field for workspace imports
- [x] 2.7 Run `pnpm db:generate` to create initial migration
- [ ] 2.8 Run `pnpm db:migrate` to apply migration to local PostgreSQL _(requires Docker)_
- [ ] 2.9 Verify all tables exist in the database with correct columns and indexes _(requires Docker)_

## 3. Authentication (apps/server)

- [x] 3.1 Install Better Auth and dependencies in `apps/server`
- [x] 3.2 Create Better Auth configuration with Discord OAuth2 provider in `apps/server/src/auth/config.ts`
- [x] 3.3 Create Hono route handler for Better Auth at `/api/auth/*`
- [x] 3.4 Create session validation middleware in `apps/server/src/auth/middleware.ts`
- [x] 3.5 Create guild permission check middleware that verifies `MANAGE_GUILD` via Discord API
- [x] 3.6 Add `subscriptionTier` and `role` fields to Better Auth user schema
- [x] 3.7 Configure Better Auth to auto-create database tables on first run
- [ ] 3.8 Test: Discord OAuth2 flow creates user record in database _(requires running server + Discord app)_
- [ ] 3.9 Test: Session middleware returns 401 for unauthenticated requests _(requires running server)_
- [ ] 3.10 Test: Session middleware attaches user to context for authenticated requests _(requires running server)_

## 4. Hono API Shell (apps/server)

- [x] 4.1 Install Hono and dependencies in `apps/server`
- [x] 4.2 Create `apps/server/src/index.ts` entry point that starts Hono server
- [x] 4.3 Configure CORS middleware to allow requests from web app dev URL (localhost:5173)
- [x] 4.4 Implement `GET /api/health` endpoint returning status, timestamp, and database connection status
- [x] 4.5 Implement `GET /api/plan/:id/stream` SSE endpoint using `hono/streaming` with placeholder event
- [x] 4.6 Apply session validation middleware to all `/api/*` routes except `/api/auth/*` and `/api/health`
- [x] 4.7 Configure server to listen on port 3001 (configurable via PORT env var)
- [ ] 4.8 Test: `GET /api/health` returns 200 with correct JSON body _(requires running server)_
- [ ] 4.9 Test: SSE endpoint establishes connection and sends placeholder event _(requires running server)_
- [ ] 4.10 Test: Protected route returns 401 without session cookie _(requires running server)_

## 5. Discord.js Bot Skeleton (apps/server)

- [x] 5.1 Install Discord.js v14 in `apps/server`
- [x] 5.2 Create `apps/server/src/bot/client.ts` with Discord.js Client instantiation and configured intents (Guilds, GuildMessages, GuildMembers)
- [x] 5.3 Create `apps/server/src/bot/cache.ts` with typed Map structures for channels, roles, and permissions
- [x] 5.4 Implement cache initialization on bot `ready` event (fetch guilds, channels, roles from Discord API)
- [x] 5.5 Implement cache update handlers for Gateway events (channel create/update/delete, role create/update/delete)
- [x] 5.6 Export bot client and cache from `apps/server/src/bot/index.ts` for import by Hono routes
- [x] 5.7 Update `apps/server/src/index.ts` to start bot client alongside Hono server
- [ ] 5.8 Test: Bot connects to Discord Gateway and emits `ready` event _(requires Discord bot token)_
- [ ] 5.9 Test: Bot cache is populated with guild state after ready _(requires Discord bot token)_
- [ ] 5.10 Test: Hono route can import and read from bot cache _(requires running server)_

## 6. Web App Shell (apps/web)

- [x] 6.1 Create Vite + React project in `apps/web` with TypeScript template
- [x] 6.2 Install and configure React Router v6
- [x] 6.3 Install and configure Tailwind CSS with Discord dark theme tokens (colors: #313338 bg, #dcddde text, #5865f2 accent, etc.)
- [x] 6.4 Install Zustand
- [x] 6.5 Create `apps/web/src/stores/authStore.ts` with user, isAuthenticated, login, logout state
- [x] 6.6 Create `apps/web/src/stores/studioStore.ts` with selectedGuild, panel state, drag/drop state, multi-select state
- [x] 6.7 Create `apps/web/src/stores/dashboardStore.ts` with dashboard UI state
- [x] 6.8 Create route components: `App.tsx` with Router, `Studio.tsx`, `Dashboard.tsx`, `Setup.tsx`, `NotFound.tsx`
- [x] 6.9 Configure routes: `/`, `/studio`, `/studio/:guildId`, `/dashboard`, `/dashboard/:guildId`, `/setup`, `/setup/:guildId`
- [x] 6.10 Implement root redirect logic (to `/studio` if authenticated, to login if not)
- [x] 6.11 Create placeholder components for each route showing route name and guild ID (if applicable)
- [x] 6.12 Create `apps/web/.env.example` with `VITE_API_URL` variable
- [x] 6.13 Configure Vite proxy for API requests during development
- [ ] 6.14 Test: Web app starts on port 5173 with HMR _(requires running dev server)_
- [ ] 6.15 Test: Navigation between routes works correctly _(requires running dev server)_
- [ ] 6.16 Test: Tailwind Discord theme colors are applied _(requires running dev server)_

## 7. Development Workflow

- [x] 7.1 Install `concurrently` in root `package.json`
- [x] 7.2 Configure root `pnpm dev` to run `apps/web` and `apps/server` concurrently with prefixed output
- [ ] 7.3 Verify `pnpm dev` starts both web app (5173) and server (3001) _(requires full env setup)_
- [x] 7.4 Verify `pnpm lint` runs ESLint across all packages
- [x] 7.5 Verify `pnpm format` runs Prettier across all packages
- [ ] 7.6 Verify `docker compose up -d` starts PostgreSQL and database is accessible _(requires Docker)_
- [x] 7.7 Verify `pnpm db:generate` creates migrations from schema changes
- [ ] 7.8 Verify `pnpm db:migrate` applies migrations to the database _(requires Docker)_
- [x] 7.9 Document setup steps in a root `README.md` (clone, install, env, docker, dev)
