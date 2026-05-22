## ADDED Requirements

### Requirement: pnpm workspace structure

The project SHALL use pnpm workspaces to manage a monorepo with the following package structure:

- `apps/web` — Vite + React SPA
- `apps/server` — Hono API + Discord.js Bot
- `apps/docs` — Astro SSG (scaffold only)
- `packages/shared` — Shared types, Zod schemas, utilities
- `packages/db` — Drizzle ORM schema, migrations, database client

A `pnpm-workspace.yaml` file at the root SHALL declare all packages.

#### Scenario: Workspace packages are recognized

- **WHEN** `pnpm list -r --depth 0` is run from the project root
- **THEN** all 5 packages are listed with their correct paths

#### Scenario: Root scripts delegate to workspace packages

- **WHEN** `pnpm dev` is run from the project root
- **THEN** both `apps/web` and `apps/server` start in development mode concurrently

### Requirement: Shared TypeScript configuration

A base `tsconfig.base.json` SHALL exist at the project root with strict mode enabled, ES2022 target, and ESNext module resolution. Each workspace package SHALL extend this base config with project-specific overrides.

#### Scenario: TypeScript strict mode is enforced

- **WHEN** a file with an implicit `any` type is compiled
- **THEN** the TypeScript compiler reports an error

#### Scenario: Web app has DOM type definitions

- **WHEN** `apps/web/tsconfig.json` is inspected
- **THEN** it extends `tsconfig.base.json` and includes `DOM` and `DOM.Iterable` in lib

#### Scenario: Server app has Node.js type definitions

- **WHEN** `apps/server/tsconfig.json` is inspected
- **THEN** it extends `tsconfig.base.json` and includes Node.js type definitions

### Requirement: ESLint and Prettier configuration

ESLint and Prettier SHALL be configured at the project root and inherited by all workspace packages. The configuration SHALL enforce consistent code style across the monorepo.

#### Scenario: Lint command runs across all packages

- **WHEN** `pnpm lint` is run from the project root
- **THEN** ESLint checks all TypeScript files in all workspace packages

#### Scenario: Format command applies consistent style

- **WHEN** `pnpm format` is run from the project root
- **THEN** Prettier formats all applicable files across all workspace packages

### Requirement: Docker Compose for local PostgreSQL

A `docker-compose.yml` file SHALL exist at the project root, defining a PostgreSQL 16 Alpine service with:

- Port 5432 exposed to localhost
- Database name: `discord_platform`
- Username: `dev`, Password: `dev`
- Persistent volume for data

#### Scenario: Database starts with one command

- **WHEN** `docker compose up -d` is run from the project root
- **THEN** PostgreSQL is running and accepting connections on localhost:5432

#### Scenario: Database credentials are correct

- **WHEN** connecting to the database with user `dev` and password `dev`
- **THEN** the connection succeeds and the `discord_platform` database exists

### Requirement: Environment variable management

Each workspace package SHALL have a `.env.example` file documenting required environment variables. The root project SHALL have a `.env.example` with all shared variables. Actual `.env` files SHALL be gitignored.

#### Scenario: Environment variables are documented

- **WHEN** a developer clones the repository
- **THEN** they can copy `.env.example` to `.env` and fill in the values

#### Scenario: Secrets are not committed

- **WHEN** `.env` files exist in the repository
- **THEN** they are excluded by `.gitignore`
