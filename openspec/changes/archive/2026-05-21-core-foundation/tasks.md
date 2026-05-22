## 1. Shared types and constants

- [x] 1.1 Create `packages/shared/src/types.ts` with domain interfaces: ChannelBase, CategoryNode, TextChannel, VoiceChannel, Role, PermissionOverwrite, ServerState
- [x] 1.2 Add Plan, PlanStep, PlanStatus types to `packages/shared/src/types.ts`
- [x] 1.3 Add SymbolEntry, SymbolTable, Assumption, AssumptionStatus types to `packages/shared/src/types.ts`
- [x] 1.4 Add Iteration, IterationType, Snapshot, SnapshotType types to `packages/shared/src/types.ts`
- [x] 1.5 Create `packages/shared/src/constants.ts` with DISCORD_PERMISSIONS map (name → bitfield value + description)
- [x] 1.6 Add CHANNEL_TYPES, PLAN_STATUSES, SNAPSHOT_TYPES constants to `packages/shared/src/constants.ts`
- [x] 1.7 Update `packages/shared/src/index.ts` to re-export types and constants

## 2. Tool Zod schemas

- [x] 2.1 Create `packages/shared/src/tools/categories.ts` with createCategorySchema, editCategorySchema, deleteCategorySchema
- [x] 2.2 Create `packages/shared/src/tools/channels.ts` with createChannelSchema, editChannelSchema, deleteChannelSchema, moveChannelSchema
- [x] 2.3 Create `packages/shared/src/tools/roles.ts` with createRoleSchema, editRoleSchema, deleteRoleSchema, moveRoleSchema
- [x] 2.4 Create `packages/shared/src/tools/permissions.ts` with setOverwriteSchema, removeOverwriteSchema
- [x] 2.5 Create `packages/shared/src/tools/interaction.ts` with askUserSchema
- [x] 2.6 Create `packages/shared/src/tools/index.ts` to re-export all 14 tool schemas
- [x] 2.7 Update `packages/shared/src/index.ts` to re-export tools

## 3. Bot state formatter and cache helpers

- [x] 3.1 Add cache query helpers to `apps/server/src/bot/cache.ts`: getChannelByName, getChannelsByParent, getChildrenCount, getRoleByName, getChannelsByType
- [x] 3.2 Create `apps/server/src/bot/formatter.ts` with formatGuildForLLM(guildId) function
- [x] 3.3 Implement server header and category/channel hierarchy formatting in formatter
- [x] 3.4 Implement permission overwrite notation (+allow, -deny) in formatter
- [x] 3.5 Implement role representation with permissions and member counts in formatter
- [x] 3.6 Handle empty guilds gracefully in formatter
- [x] 3.7 Export formatter from bot module

## 4. API route structure

- [x] 4.1 Create `apps/server/src/hono/routes/` directory structure
- [x] 4.2 Create `apps/server/src/hono/routes/guilds.ts` with guild list, get, and update endpoints (stubbed with TODO for MANAGE_GUILD permission check)
- [x] 4.3 Create `apps/server/src/hono/routes/rules.ts` with CRUD endpoints for rules
- [x] 4.4 Mount guilds and rules routes in `apps/server/src/hono/app.ts`

## 5. Rules API implementation

- [x] 5.1 Implement POST /api/guilds/:guildId/rules — create rule with validation
- [x] 5.2 Implement GET /api/guilds/:guildId/rules — list rules for guild
- [x] 5.3 Implement PUT /api/guilds/:guildId/rules/:ruleId — update rule text
- [x] 5.4 Implement DELETE /api/guilds/:guildId/rules/:ruleId — delete rule
- [x] 5.5 Add input validation (Zod) for all rule endpoints
- [x] 5.6 Add error handling for not-found and unauthorized cases

## 6. Guild API implementation

- [x] 6.1 Implement GET /api/guilds — list accessible guilds from bot cache
- [x] 6.2 Implement GET /api/guilds/:guildId — get guild settings (with fallback to cache for unregistered guilds)
- [x] 6.3 Implement PATCH /api/guilds/:guildId — update serverType and settings (upsert)
- [x] 6.4 Add input validation for guild settings update
- [x] 6.5 Add error handling for not-found and unauthorized cases

## 7. Verification

- [x] 7.1 Run `pnpm lint` and fix any issues
- [x] 7.2 Run `pnpm --filter @repo/shared build` to verify shared package compiles
- [x] 7.3 Run `pnpm --filter @repo/server build` to verify server compiles with new routes
- [x] 7.4 Verify `pnpm dev` starts both web and server without errors
