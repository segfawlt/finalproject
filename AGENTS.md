# Discord Platform — Project Overview

AI-driven Discord server management platform. Administrators describe server configurations in natural language — the system plans, previews (via a Discord-like Studio UI), validates, and executes changes through a Discord bot.

**Declarative, plan-first architecture. Never imperative. Never blind.**

> **Code exploration**: Start with `Glob` for file discovery, `Grep` for content search, and `read` for focused file inspection.

## Agent Behavior

### Think Before Coding

- State assumptions explicitly. If multiple interpretations exist, present them — don't pick silently.
- If something is unclear, stop and ask. Don't hide confusion.
- If a simpler approach exists, say so. Push back when warranted.

### Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

- Touch only what you must. Don't "improve" adjacent code, comments, or formatting.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused. Don't delete pre-existing dead code unless asked.

### Goal-Driven Execution

- Define verifiable success criteria before implementing.
- For multi-step tasks, state a brief plan with verification checkpoints.
- Loop until verified — don't stop at "should work now."

### Keep Docs In Sync

When you change code, update the affected docs in the same change. If a rule, command, env var, or file path in AGENTS.md no longer matches the code, fix the doc. Same for design docs under `docs/design/`. Don't expand doc scope — just keep it accurate. Line counts, file lists, and command tables go stale fast; treat them as living.

**Specifically for `docs/IMPLEMENTATION_STATUS.md`:** when you add, remove, or significantly change a feature/route/file, update the matching entry in the same commit — add new files to the right subsection, move resolved gaps to "Recently resolved", and bump the "Last updated" date at the top. If a sweep is overdue, run a fresh inventory check before editing.

### Compound Learnings

`docs/learnings/` holds durable lessons captured by the `compound` skill — bug fixes, design decisions, non-obvious workarounds. Each learning is a standalone markdown file with YAML frontmatter, organized by category.

**Before non-trivial work:** read `docs/learnings/README.md` (the index) and check entries with relevant tags. If a learning's tag matches your current task, read the full file and apply the lesson. When you apply an existing learning, increment its `## References` count (the `compound` skill will surface the increment for you).

**When to write a new learning:** invoke the `compound` skill after any of these:
- **After any `systematic-debugging` session resolves a bug, invoke `compound` before moving on to the next task** (this is the primary trigger)
- Fixed a non-trivial bug (outside of formal debugging)
- Solved a tricky problem that took more than one attempt
- Discovered a non-obvious workaround for a library, framework, or Discord.js quirk
- Resolved a design decision with surprising rationale

**Promotion:** the `compound` skill surfaces lessons referenced 3+ times in `docs/learnings/README.md` → "## Promote Candidates". Review weekly. If a lesson deserves a spot in this file as a project-wide rule, copy its core directive here. The agent never writes to AGENTS.md directly.

**Hygiene:** run the `compound-refresh` skill monthly (or after major refactors) to detect stale references, duplicates, and obsolete docs.

**Session-end check:** if this session produced a durable lesson and `compound` was not invoked during the work, invoke it before ending.

## Tech Stack

| Layer     | Technology                                           |
| --------- | ---------------------------------------------------- |
| Frontend  | Vite + React, React Router v7, Zustand, Tailwind CSS |
| Backend   | Hono, Discord.js v14, Better Auth                    |
| Database  | PostgreSQL, Drizzle ORM                              |
| AI        | OpenRouter (raw fetch)                               |
| Real-time | SSE (Server-Sent Events)                             |
| Language  | TypeScript                                           |
| Monorepo  | pnpm workspaces                                      |

## Architecture

```
apps/
├── web/          Vite + React SPA (Studio + Dashboard)
└── server/       Hono API + Discord.js Bot (monolith)
packages/
├── shared/       Tool registry, types, validation utilities
└── db/           Drizzle ORM schema, migrations
docs/             Design docs + issues (markdown)
```

Key design documents live under [`docs/design/`](./docs/design/). Change management uses Superpowers skills.

## Implementation Status

Before exploring code, read [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) — it's a flat checklist of what's actually built per subsystem, with file paths, plus known gaps and a drift log of corrections to other docs. When design docs, issue docs, or comments disagree with code, that file wins.

For API-level detail (function signatures, types, interfaces), run `pnpm docs:api` to generate HTML reference in `docs/api/`, then grep the output. Output is gitignored.

**Entry points:**

| App      | File                           | Purpose                               |
| -------- | ------------------------------ | ------------------------------------- |
| `server` | `apps/server/src/index.ts`     | Process entry — starts Hono + bot     |
| `server` | `apps/server/src/hono/app.ts`  | Hono app composition, mounts routes   |
| `server` | `apps/server/src/bot/index.ts` | Discord bot lifecycle                 |
| `web`    | `apps/web/src/main.tsx`        | React entry, mounts router            |
| `web`    | `apps/web/src/App.tsx`         | Route table                           |
| `shared` | `packages/shared/src/index.ts` | Public barrel (`export *`)            |
| `db`     | `packages/db/src/index.ts`     | DB barrel; `schema.ts` exports tables |

## Code Conventions

Follow the patterns listed below. These are **descriptive** (what the codebase already does), not aspirational.

### Formatting (enforced by Prettier)

- Double quotes (`"foo"`), not single
- Always semicolons
- Trailing commas (ES5 style)
- 100 char print width, 2-space indentation, no tabs

### File & Directory Naming

- Files: `kebab-case.ts` (e.g., `diff-engine.ts`, `event-bus.ts`)
- Directories: `kebab-case` (e.g., `hono/routes/`, `planning/bot/`)
- React components: `PascalCase.tsx` (e.g., `Studio.tsx`, `Dashboard.tsx`)

### Naming Conventions

| Element          | Convention                    | Examples                                    |
| ---------------- | ----------------------------- | ------------------------------------------- |
| Functions        | `camelCase`                   | `clearStaleLocks()`, `validatePlan()`       |
| Classes          | `PascalCase`                  | `DiscordExecuteContext`, `PlanningSession`  |
| Types/Interfaces | `PascalCase`                  | `ServerState`, `PlanStep`, `ApiResponse<T>` |
| Constants        | `SCREAMING_SNAKE_CASE`        | `DISCORD_PERMISSIONS`, `MAX_RETRIES`        |
| Zustand stores   | `camelCase` hook: `useXStore` | `useAuthStore`, `authStore.ts`              |

### Exports

- **Named exports** are the default. Use `export const` / `export function`.
- `export default` only for: Hono route apps (`export default guildsApp`) and React page components (`export default function Studio()`).
- The `packages/shared` barrel file (`index.ts`) re-exports everything via `export *`.

### Import Order

1. External packages first (`zod`, `hono`, `discord.js`, `drizzle-orm`)
2. Workspace packages (`@repo/db`, `@repo/shared`)
3. Relative imports (`"../auth/middleware"`, `"./client"`)
4. Type-only imports use `import type { ... }` and are grouped separately

### Error Handling

Three patterns are used, context-dependent. Match the surrounding code:

```ts
// 1. Discriminated union — for validation, permission checks
function checkSomething(id: string): { ok: true } | { ok: false; status: 404; error: string }

// 2. Try/catch — for bot startup, plan execution, external calls
try { ... } catch (err) { /* handle */ }

// 3. Throw-on-error — for planning validation, tool dispatch, state store invariants
throw new Error(`A channel named "${name}" already exists`);
```

### TypeScript

- Strict mode is enabled globally (`tsconfig.base.json`).
- `any` is warned by ESLint but allowed sparingly. Prefer `Record<string, unknown>` or `unknown` with narrowing.
- JSONB columns use type casting: `plan.planData as unknown as PlanData`.
- Non-null assertions (`!`) are used for route params where existence is guaranteed: `c.req.param("guildId")!`.
- Use `as const` on literal arrays for type narrowing: `["draft", "review", "approved"] as const`.
- Derive types from Zod schemas: `z.infer<typeof mySchema>`.

### React Components

```tsx
// Export default, function declaration (not arrow function)
export default function ComponentName() {
  // Zustand selectors for granular re-renders
  const value = useSomeStore((s) => s.value);

  // Route params via hooks
  const { guildId } = useParams();
  const navigate = useNavigate();

  // Tailwind CSS for all styling
  return <div className="min-h-screen bg-discord-bg">{...}</div>;
}
```

### Hono Route Handlers

Every route file follows this structure:

```ts
imports → Zod schema → const xApp = new Hono<{ Variables: AppVariables }>()
→ route handlers (permission check at top of each)
→ export default xApp
```

### Database (Drizzle)

```ts
import { db, guilds } from "@repo/db";
import { eq, desc, and } from "drizzle-orm";

// Select
const [row] = await db.select().from(guilds).where(eq(guilds.id, id));

// Insert with returning
const [created] = await db.insert(guilds).values(data).returning();

// Raw SQL only for tables not in the Drizzle schema (Better Auth's account table)
// Use queryClient for these rare cases
```

## Tools & Code Exploration

### Commands

| Command             | Description                                    |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Start web app + server concurrently            |
| `pnpm test`         | Run Vitest in watch mode                       |
| `pnpm test:run`     | Run Vitest once (CI)                           |
| `pnpm lint`         | Run ESLint across all packages                 |
| `pnpm format`       | Format code with Prettier                      |
| `pnpm format:check` | Check formatting (CI)                          |
| `pnpm typecheck`    | Run `tsc --noEmit` across all packages         |
| `pnpm db:generate`  | Generate Drizzle migration from schema changes |
| `pnpm db:migrate`   | Apply pending migrations                       |
| `pnpm db:studio`    | Open Drizzle Studio (database GUI)             |

### Code Exploration Workflow

Use the standard file tools for codebase exploration:

1. Start with `Glob` to find files by path or extension patterns.
2. Use `Grep` to search for exact symbols, imports, route paths, error messages, and other text.
3. Use `read` to inspect the smallest useful file ranges from search results.
4. Prefer focused searches over broad scans, and verify behavior in source before editing.

## Setup

```bash
cp .env.example .env          # fill in secrets (see Environment Variables below)
docker compose up -d           # start PostgreSQL on port 5432
pnpm install
pnpm db:migrate
pnpm dev                      # web :5173 | server :3001
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable                | Purpose                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                                |
| `DISCORD_BOT_TOKEN`     | Discord bot token                                           |
| `DISCORD_CLIENT_ID`     | Discord application client ID                               |
| `DISCORD_CLIENT_SECRET` | Discord application client secret                           |
| `BETTER_AUTH_SECRET`    | Encryption key for Better Auth sessions (min 32 chars)      |
| `BETTER_AUTH_URL`       | Base URL for auth callbacks (e.g., `http://localhost:5173`) |
| `PORT`                  | Server port (default: `3001`)                               |
| `NODE_ENV`              | Environment (`development`, `production`)                   |
| `VITE_API_URL`          | API URL for the web app (in `apps/web/.env`)                |

`LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` are required at runtime for AI features (see `.env.example`). Leave `LLM_API_KEY` unset in development to use the mock planner.

**Never commit `.env` files or secrets.**

## Database

PostgreSQL 16 via Docker. Credentials: `dev` / `dev`, database: `discord_platform`.

Schema is defined in `packages/db/src/schema.ts` using Drizzle ORM. Common table patterns:

- Every table has `id`, `createdAt`, `updatedAt`
- Column names use `snake_case` with double-quoted strings: `text("guild_id")`
- Foreign keys: `.references(() => otherTable.id)`
- Relations defined separately with Drizzle `relations()` function

## Testing Strategy

**Framework**: Vitest (shares Vite's transform pipeline, native TypeScript support, workspace-aware).

**Vitest is installed at the workspace root.** When adding tests, follow this priority order:

| Priority | Package           | What to test                                         | Key dependencies                        |
| -------- | ----------------- | ---------------------------------------------------- | --------------------------------------- |
| 1        | `packages/shared` | Zod schemas, validation, type guards                 | vitest only                             |
| 2        | `packages/db`     | Drizzle queries (requires PostgreSQL test DB)        | vitest + postgres test database         |
| 3        | `apps/server`     | Hono routes (supertest), planning logic, diff engine | vitest + supertest + Discord.js mocks   |
| 4        | `apps/web`        | React components (jsdom), Zustand stores             | vitest + @testing-library/react + jsdom |

### Testability by File

The codebase has a clean architecture: most planning code depends on the `ExecuteContext` interface (defined in `packages/shared/src/execute-context.ts`), not on Discord.js directly. This means ~60% of server logic is testable with a simple mock object.

**EASY — pure logic, no external mocks needed:**

| File                                                                                                     | What to test                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/shared/src/state/desired-state-store.ts`                                                       | CRUD operations, validation errors, symbol generation, fork/snapshot/revert    |
| `packages/shared/src/state/fork.ts`                                                                      | ServerState → DesiredState transformation                                      |
| `packages/shared/src/constants.ts`                                                                       | bitfieldToPermissionNames, permissionNamesToBitfield, parsePermissionString    |
| `packages/shared/src/hash-server-state.ts`                                                               | Deterministic hashing, stable stringify                                        |
| `packages/shared/src/tools/channels.ts`, `roles.ts`, `categories.ts`, `permissions.ts`, `interaction.ts` | plan functions, assumptions, execute (with mock ctx)                           |
| `packages/shared/src/tools/registry.ts`                                                                  | Registry invariants, getTool error cases                                       |
| `packages/shared/src/zod-schemas.ts`                                                                     | Schema parse/safeParse                                                         |
| `apps/server/src/planning/diff-engine.ts`                                                                | Full 3-phase diff algorithm, edge cases — **highest-value test target**        |
| `apps/server/src/planning/validation.ts`                                                                 | Validation groups B–E (pure functions on PlanStep[]/DesiredState)              |
| `apps/server/src/planning/event-bus.ts`                                                                  | Pub/sub subscribe/emit/unsubscribe                                             |
| `apps/server/src/planning/execution-engine.ts`                                                           | resolveSymbols, isTransientError, isKnownError, computeBackoff, getInverseTool |
| `apps/server/src/bot/cache.ts`                                                                           | Lookup helpers on a seeded Map                                                 |

**MEDIUM — needs a test DB or simple mock:**

| File                                           | What mocks needed                                             |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `apps/server/src/planning/locking.ts`          | Drizzle `db` mock or test DB                                  |
| `apps/server/src/planning/snapshot-cleanup.ts` | Drizzle mock + fake timers                                    |
| `apps/server/src/planning/execution-engine.ts` | Mock `ExecuteContext` interface — plain object with `vi.fn()` |
| `apps/server/src/planning/planning-session.ts` | Mock `fetch` (or use `mockLLMResponse`), mock `emit`          |
| `apps/server/src/bot/formatter.ts`             | Seed `guildCache` Map (pure data)                             |
| `apps/server/src/auth/middleware.ts`           | Mock `auth.api.getSession`                                    |

**HARD — needs full Discord.js mock or integration test:**

| File                                      | Why                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `apps/server/src/bot/execute-context.ts`  | Every method calls real Discord.js Guild APIs                                              |
| `apps/server/src/bot/permissions.ts`      | Accesses `botClient.guilds.cache.get().members.me.permissions`                             |
| `apps/server/src/planning/guild-check.ts` | Depends on `guildCache` + `botHasAdministrator`                                            |
| `apps/server/src/auth/helpers.ts`         | Raw SQL query + Discord member fetch                                                       |
| `apps/server/src/hono/routes/*.ts`        | Thin orchestrators — lower test priority, use Hono's `app.request()` for integration tests |

Start with the EASY files — they have the most logic and the least setup overhead.

### Discord.js Mocking

Only 5 files need Discord.js mocks. Everything else uses the `ExecuteContext` interface. When mocking Discord.js, create a factory that returns the 6 category mocks: Client, Guild, Channel, Role, GuildMember, and enum/constants (PermissionFlagsBits, ChannelType, GatewayIntentBits, Events).

**Conventions**:

- Test files colocated with source: `foo.test.ts` next to `foo.ts`
- Use `describe`/`it` blocks — no `test()` function
- Discord.js must be fully mocked (external service)
- Database tests should use PostgreSQL-compatible setup; do not swap to SQLite unless the schema and queries are explicitly designed for it.

### Who Runs Tests

Split test execution between the main agent and subagents based on feedback needs:

| When                               | Who            | Why                                          |
| ---------------------------------- | -------------- | -------------------------------------------- |
| TDD RED — watch test fail          | Main agent     | Needs actual error message + stack trace     |
| TDD GREEN — confirm test passes    | Main agent     | Needs to see the green output directly       |
| Pre-commit — verify all tests pass | Executor agent | Binary pass/fail, large output, no deep read |
| TypeScript compilation check       | Executor agent | Large output, binary pass/fail               |
| Lint check                         | Executor agent | Large output, binary pass/fail               |

The TDD feedback loop requires tight iteration — offloading the test runner adds
latency and loses error detail that the main agent needs to diagnose failures.

## PR & Commit Conventions

- Use **conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` (optional scope in parens: `feat(server): add rate limiting`)
- Squash merge to `main`
- Branch naming: `feature/description` or `fix/description`

## References

- [ProjectDescription.md](./ProjectDescription.md) — Full project overview
- [docs/design/](./docs/design/) — System design documents
- Superpowers skills — Development workflows (brainstorming, TDD, debugging, etc.)
- [docs/issues/open-design-issues.md](./docs/issues/open-design-issues.md) — Resolved decisions and open questions
