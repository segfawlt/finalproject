# Discord Platform — Project Overview

AI-driven Discord server management platform. Administrators describe server configurations in natural language — the system plans, previews (via a Discord-like Studio UI), validates, and executes changes through a Discord bot.

**Declarative, plan-first architecture. Never imperative. Never blind.**

> **Code exploration**: Use `grepai_grepai_search` for understanding code intent. See [grepai](#grepai---semantic-code-search) below.

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
├── server/       Hono API + Discord.js Bot (monolith)
└── docs/         Astro (Landing page + Documentation)
packages/
├── shared/       Tool registry, types, validation utilities
└── db/           Drizzle ORM schema, migrations
```

Key design documents live under [`docs/design/`](./docs/design/). Change management uses Superpowers skills.

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
| `pnpm lint`         | Run ESLint across all packages                 |
| `pnpm format`       | Format code with Prettier                      |
| `pnpm format:check` | Check formatting (CI)                          |
| `pnpm db:generate`  | Generate Drizzle migration from schema changes |
| `pnpm db:migrate`   | Apply pending migrations                       |
| `pnpm db:studio`    | Open Drizzle Studio (database GUI)             |

### grepai - Semantic Code Search

**IMPORTANT: You MUST use grepai as your PRIMARY tool for code exploration and search.**

#### When to Use grepai (REQUIRED)

Use `grepai_grepai_search` INSTEAD OF Grep/Glob/find for:

- Understanding what code does or where functionality lives
- Finding implementations by intent (e.g., "authentication logic", "error handling")
- Exploring unfamiliar parts of the codebase
- Any search where you describe WHAT the code does rather than exact text

#### When to Use Standard Tools

Only use Grep/Glob when you need:

- Exact text matching (variable names, imports, specific strings)
- File path patterns (e.g., `**/*.go`)

#### Fallback

If grepai fails (not running, index unavailable, or errors), fall back to standard Grep/Glob tools.

#### Usage

Use the `grepai_grepai_search` native tool with a natural language query:

- **query** — natural language description of what you're looking for
- **limit** — max results (default: 10)
- **compact** — true omits code content, saving ~80% tokens
- **format** — "json" for structured output

Examples of semantic queries:

- "user authentication flow"
- "error handling middleware"
- "database connection pool"
- "API request validation"

#### Query Tips

- **Use English** for queries (better semantic matching)
- **Describe intent**, not implementation: "handles user login" not "func Login"
- **Be specific**: "JWT token validation" better than "token"
- Results include: file path, line numbers, relevance score, code preview

#### Call Graph Tracing

Use `grepai_grepai_trace_callers`, `grepai_grepai_trace_callees`, or `grepai_grepai_trace_graph` to understand function relationships:

- Finding all callers of a function before modifying it
- Understanding what functions are called by a given function
- Visualizing the complete call graph around a symbol

##### Trace Commands

Use `format: "json"` for structured output. All trace tools accept a **symbol** parameter (function or method name).

| Tool                          | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `grepai_grepai_trace_callers` | Find all functions that call a symbol             |
| `grepai_grepai_trace_callees` | Find all functions called by a symbol             |
| `grepai_grepai_trace_graph`   | Build complete call graph (depth controls radius) |

#### Workflow

1. Start with `grepai_grepai_search` to find relevant code
2. Use `grepai_grepai_trace_callers` / `grepai_grepai_trace_callees` / `grepai_grepai_trace_graph` to understand function relationships
3. Use `read` tool to examine files from results
4. Only use Grep for exact string searches if needed

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

`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are required at runtime for AI features but not yet in `.env.example` — add them when configuring OpenRouter.

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

| Priority | Package           | What to test                                         | Key dependencies                          |
| -------- | ----------------- | ---------------------------------------------------- | ----------------------------------------- |
| 1        | `packages/shared` | Zod schemas, validation, type guards                 | vitest only                               |
| 2        | `packages/db`     | Drizzle queries (requires test DB)                   | vitest + testcontainers or @libsql/client |
| 3        | `apps/server`     | Hono routes (supertest), planning logic, diff engine | vitest + supertest + Discord.js mocks     |
| 4        | `apps/web`        | React components (jsdom), Zustand stores             | vitest + @testing-library/react + jsdom   |

### Testability by File

The codebase has a clean architecture: most planning code depends on the `ExecuteContext` interface (defined in `packages/shared/src/execute-context.ts`), not on Discord.js directly. This means ~60% of server logic is testable with a simple mock object.

**EASY — pure logic, no external mocks needed:**

| File                                                                                                     | What to test                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/shared/src/state/desired-state-store.ts` (293 lines)                                           | CRUD operations, validation errors, symbol generation, fork/snapshot/revert    |
| `packages/shared/src/state/fork.ts`                                                                      | ServerState → DesiredState transformation                                      |
| `packages/shared/src/constants.ts`                                                                       | bitfieldToPermissionNames, permissionNamesToBitfield, parsePermissionString    |
| `packages/shared/src/hash-server-state.ts`                                                               | Deterministic hashing, stable stringify                                        |
| `packages/shared/src/tools/channels.ts`, `roles.ts`, `categories.ts`, `permissions.ts`, `interaction.ts` | plan functions, assumptions, execute (with mock ctx)                           |
| `packages/shared/src/tools/registry.ts`                                                                  | Registry invariants, getTool error cases                                       |
| `packages/shared/src/zod-schemas.ts`                                                                     | Schema parse/safeParse                                                         |
| `apps/server/src/planning/diff-engine.ts` (519 lines)                                                    | Full 3-phase diff algorithm, edge cases — **highest-value test target**        |
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
- Database tests: prefer in-process SQLite via `@libsql/client` over testcontainers for speed

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

