

### Requirement: Drizzle ORM setup

The project SHALL use Drizzle ORM with the PostgreSQL dialect for database access. The schema SHALL be defined in `packages/db/src/schema.ts` and exported for use by other packages. A database client SHALL be exported from `packages/db/src/index.ts`.

#### Scenario: Database client connects to PostgreSQL

- **WHEN** the database client is initialized with valid connection string
- **THEN** it successfully connects to the PostgreSQL instance

#### Scenario: Schema is importable from other packages

- **WHEN** `apps/server` imports from `@repo/db`
- **THEN** all table definitions and relations are available with full TypeScript types

### Requirement: Migration pipeline

Drizzle Kit SHALL be configured to generate and apply migrations. Migrations SHALL be stored in `packages/db/drizzle/`. The migration pipeline SHALL support generating new migrations from schema changes and applying them to the database.

#### Scenario: New migration is generated from schema changes

- **WHEN** the schema is modified and `pnpm db:generate` is run
- **THEN** a new migration file is created in `packages/db/drizzle/`

#### Scenario: Migrations are applied to the database

- **WHEN** `pnpm db:migrate` is run
- **THEN** all pending migrations are applied and the database schema matches the Drizzle schema

### Requirement: Users table

The `users` table SHALL be managed by Better Auth and include: `id` (TEXT, PK), `name` (TEXT), `email` (TEXT, unique), `emailVerified` (BOOLEAN), `image` (TEXT), `discordId` (TEXT, unique), `createdAt` (TIMESTAMP), `updatedAt` (TIMESTAMP). Additional fields for subscription tier and role SHALL be included: `subscriptionTier` (TEXT, default 'free'), `role` (TEXT, default 'user').

#### Scenario: User record is created via Better Auth

- **WHEN** a user completes Discord OAuth2 login
- **THEN** a row is inserted into the `users` table with their Discord ID and email

#### Scenario: User role defaults to 'user'

- **WHEN** a new user is created
- **THEN** their `role` field is set to `'user'` by default

### Requirement: Guilds table

The `guilds` table SHALL store Discord server information with columns: `id` (TEXT, PK — Discord snowflake), `name` (TEXT), `icon` (TEXT, nullable), `serverType` (TEXT, nullable), `settings` (JSONB, default empty object), `createdAt` (TIMESTAMP), `updatedAt` (TIMESTAMP).

#### Scenario: Guild is registered on first bot join

- **WHEN** the bot joins a new Discord server
- **THEN** a row is inserted into the `guilds` table with the guild's Discord snowflake as the primary key

#### Scenario: Guild settings are stored as JSONB

- **WHEN** guild settings are updated
- **THEN** the `settings` JSONB column is updated without affecting other columns

### Requirement: Plans table

The `plans` table SHALL store execution plans with columns: `id` (UUID, PK), `guildId` (TEXT, FK → guilds.id), `userId` (TEXT, FK → users.id), `status` (TEXT — draft/validated/approved/executing/completed/failed/rolled_back), `userPrompt` (TEXT), `serverType` (TEXT, nullable), `planData` (JSONB — full plan structure including steps, symbol_table, assumptions, llm_response, complexity_score), `createdAt` (TIMESTAMP), `updatedAt` (TIMESTAMP), `executedAt` (TIMESTAMP, nullable), `completedAt` (TIMESTAMP, nullable), `error` (JSONB, nullable).

#### Scenario: Plan is stored with full structure

- **WHEN** an LLM generates a plan
- **THEN** the complete plan JSON (steps, symbol_table, assumptions, llm_response, complexity_score) is stored in the `planData` column

#### Scenario: Plan status transitions are tracked

- **WHEN** a plan moves from draft to validated to approved to executing to completed
- **THEN** the `status` column is updated and timestamps are set appropriately

### Requirement: Snapshots table

The `snapshots` table SHALL store server state snapshots with columns: `id` (UUID, PK), `type` (TEXT — execution_before/execution_after/role_deletion/plan_state), `guildId` (TEXT, FK → guilds.id), `planId` (UUID, FK → plans.id, nullable), `data` (JSONB), `createdAt` (TIMESTAMP), `expiresAt` (TIMESTAMP, nullable), `metadata` (JSONB, nullable). An index SHALL exist on `(guildId, type)` and `(expiresAt)`.

#### Scenario: Execution snapshot is stored permanently

- **WHEN** a plan executes and before/after snapshots are captured
- **THEN** rows are inserted with `expiresAt` as NULL (permanent)

#### Scenario: Role deletion snapshot has TTL

- **WHEN** a role is deleted and its member list is snapshotted
- **THEN** the row is inserted with `expiresAt` set to 30 days from creation

### Requirement: Rules table

The `rules` table SHALL store server rules with columns: `id` (UUID, PK), `guildId` (TEXT, FK → guilds.id), `ruleText` (TEXT), `createdAt` (TIMESTAMP), `updatedAt` (TIMESTAMP).

#### Scenario: Rule is created for a guild

- **WHEN** an admin adds a server rule via the dashboard
- **THEN** a row is inserted with the guild ID and rule text

### Requirement: Templates table

The `templates` table SHALL store templates with columns: `id` (TEXT, PK), `version` (INTEGER), `name` (TEXT), `description` (TEXT), `structure` (JSONB), `questions` (JSONB), `validationRules` (JSONB), `category` (TEXT, nullable), `tags` (TEXT[]), `authorId` (TEXT, FK → users.id, nullable), `isOfficial` (BOOLEAN, default false), `status` (TEXT — draft/published/archived), `createdAt` (TIMESTAMP), `updatedAt` (TIMESTAMP).

#### Scenario: Template is stored with full structure

- **WHEN** a template is created
- **THEN** the structure, questions, and validation rules are stored as JSONB columns

#### Scenario: Template tags are queryable

- **WHEN** searching templates by tag
- **THEN** the PostgreSQL array column supports efficient tag-based filtering

### Requirement: Role snapshot members table

The `role_snapshot_members` table SHALL store member lists for role deletion snapshots with columns: `id` (UUID, PK), `snapshotId` (UUID, FK → snapshots.id), `userId` (TEXT), `username` (TEXT).

#### Scenario: Role members are stored with snapshot

- **WHEN** a role is deleted and snapshotted
- **THEN** each member of the role is stored as a separate row linked to the snapshot
