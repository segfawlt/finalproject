## Context

The project has a working monorepo with database schema, auth (Better Auth + Discord OAuth2), Discord.js bot with in-memory cache, and app shells (Hono + Vite React). However, `packages/shared` contains only a placeholder comment, and the server has no business-logic API endpoints beyond auth and a health check. This change fills the gap between infrastructure and application logic by adding the domain types, constants, tool schemas, bot utilities, and basic API routes that all future modules (planning, execution, diff engine, UI) depend on.

## Goals / Non-Goals

**Goals:**
- Define TypeScript interfaces for all core domain concepts (channels, roles, permissions, plans, symbols, assumptions, iterations)
- Provide Discord constants (permission bitfield names/values, channel types, plan/snapshot statuses)
- Create Zod validation schemas for the 14 tools described in ProjectDescription.md — schema definitions only, no plan()/execute() logic
- Build a bot cache → structured text formatter matching the format in ProjectDescription.md Section 2.D
- Add cache query helpers (lookup by name, by type, by parent)
- Implement CRUD REST endpoints for server rules
- Implement guild listing (from bot cache) and guild settings read/update endpoints

**Non-Goals:**
- Tool Registry with plan()/execute()/getAssumptions() methods (needs DesiredState class first)
- DesiredState class or diff engine
- LLM planning loop or execution engine
- Web UI components
- Template retrieval or problem scanner
- Docs app (Astro)

## Decisions

### 1. File organization in packages/shared

```
packages/shared/src/
  types.ts         — All domain interfaces
  constants.ts     — Discord permission maps, channel types, status values
  tools/            — One file per tool category (categories.ts, channels.ts, roles.ts, permissions.ts, interaction.ts)
  tools/index.ts    — Re-exports all tool schemas
  index.ts          — Re-exports types, constants, tools
```

**Rationale:** Keep files focused (types vs constants vs tools) rather than one monolithic file. Tool schemas split by category (5 files) for readability, matching the design doc's categorization.

### 2. Domain type definitions

Types mirror the concepts already defined in the DB schema and bot cache, but as standalone interfaces so they're framework-agnostic:

- `ChannelType`, `ChannelBase`, `CategoryNode`, `TextChannel`, `VoiceChannel` — Discord resource types
- `Role` — Discord role with permissions
- `PermissionOverwrite` — Channel permission override
- `ServerState` — Full guild representation (channels + roles + overwrites)
- `PlanStatus`, `Plan`, `PlanStep` — Execution plan types
- `SymbolEntry`, `SymbolTable` — Symbolic reference resolution
- `Assumption`, `AssumptionStatus` — Pre-execution assumptions
- `Iteration`, `IterationType` — Plan versioning
- `SnapshotType`, `Snapshot` — State snapshots

**Rationale:** Using TypeScript interfaces (not classes) keeps them lightweight and serializable. Types are framework-agnostic — neither Drizzle nor Discord.js types leak into shared.

### 3. Discord permission constants

Build a map of permission name → bitfield value using `discord.js`'s `PermissionFlagsBits`. This gives us a single source of truth for permission validation, tool parameter definitions, and the LLM permission reference.

```ts
export const DISCORD_PERMISSIONS = {
  VIEW_CHANNEL: { bit: 10n, description: "..." },
  SEND_MESSAGES: { bit: 11n, description: "..." },
  // ... all permissions
} as const;
```

**Rationale:** The design doc says "Tools accept Discord permission names as strings (e.g., `ViewChannel`, `SendMessages`) and convert to bitfields at execution time." A centralized constant map ensures consistency between tool schemas, validation, and execution.

### 4. Tool Zod schemas — schema only

Each tool file exports a standalone Zod schema object. These are *pure validation schemas* — no plan() or execute() methods:

```ts
// packages/shared/src/tools/channels.ts
export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["text", "voice", "announcement", "stage", "forum"]),
  parent_id: z.string().optional(),
  position: z.number().optional(),
  topic: z.string().optional(),
});
```

**Rationale:** Schemas are useful immediately — they validate LLM output and tool parameters. But `plan()` requires DesiredState and `execute()` requires Discord.js patterns, both of which don't exist yet. Splitting schema-only from full Tool Registry avoids blocking on those dependencies.

**Tool list per design doc:**
- Category: `create_category`, `edit_category`, `delete_category`
- Channel: `create_channel`, `edit_channel`, `delete_channel`, `move_channel`
- Role: `create_role`, `edit_role`, `delete_role`, `move_role`
- Permission: `set_overwrite`, `remove_overwrite`
- Interaction: `ask_user`

### 5. Bot state formatter

A pure function that reads from the existing `guildCache` Maps and produces structured text matching Section 2.D:

```
Server: My Gaming Server (150 members)

Categories:
  General
    #chat — text, 5200 msgs, @everyone: +view,+send
    #memes — text, 890 msgs, @everyone: +view,+send

Roles:
  Organizer — 2 members, pos:10, MANAGE_CHANNELS, MANAGE_ROLES
  @everyone — pos:0, VIEW_CHANNEL, SEND_MESSAGES
```

**Signature:** `formatGuildForLLM(guildId: string): string` — reads from `guildCache`, returns formatted text.

**Rationale:** The format is fully specified. Member counts will be derived from the cache (where available) or fetched from Discord API. Permission notation uses `+view,+send` format as specified.

### 6. Cache query helpers

Extend `bot/cache.ts` with utility functions:

```ts
getChannelByName(guildId: string, name: string): ChannelCacheEntry | undefined
getChannelsByParent(guildId: string, parentId: string): ChannelCacheEntry[]
getChildrenCount(guildId: string, parentId: string): number
getRoleByName(guildId: string, name: string): RoleCacheEntry | undefined
getChannelsByType(guildId: string, type: number): ChannelCacheEntry[]
```

**Rationale:** These are pure lookups on the existing Map structure. Zero risk.

### 7. API route structure

Following the existing Hono pattern where `app.ts` mounts route modules:

```
apps/server/src/hono/
  app.ts              — Existing, will import new route modules
  routes/
    guilds.ts         — GET /api/guilds, GET /api/guilds/:id, PATCH /api/guilds/:id
    rules.ts          — POST /api/guilds/:guildId/rules, GET, PUT, DELETE
```

All routes use the existing `authMiddleware` + `requireAuth` guard. Validation uses Zod schemas inline.

**Rationale:** Consistent with existing code style. Routes are simple CRUD — no business logic complexity.

## Risks / Trade-offs

- **Tool schema parameters may change** during planning loop implementation → Mitigation: Zod schemas are easy to update. Schema-only without plan()/execute() means no wasted code.
- **Guild list from cache may be incomplete** if bot just started (cache still populating) → Mitigation: Cache is populated in `ClientReady` event before any API calls arrive. Gateway events keep it synced.
- **Member counts in state formatter** require manual Discord API calls (not in cache yet) → Mitigation: Fetch member counts lazily or omit from initial implementation (shown as `?` if unavailable).
- **Permission notation in structured text** depends on consistent application of `+`/`-` prefixing → Mitigation: Follow the exact format in ProjectDescription.md Section 2.D.

## Open Questions

- Should member counts in the structured text formatter be fetched eagerly or lazily? (Start lazily — omit if cache doesn't have it.)
- Will the `ask_user` tool schema need to support `multi_select` + `custom_input` options? (Include from the start per design doc.)
- Should the guild list endpoint filter to guilds the user has `MANAGE_GUILD` permission in? (Yes — use Discord API to check per guild.)
