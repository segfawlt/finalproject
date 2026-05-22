## Why

The project has database schema, auth, bot cache, and app shells in place, but lacks the foundational shared types, tool definitions, bot utilities, and basic API routes that all other modules depend on. Implementation of the planning loop, diff engine, execution engine, and UI components is blocked until these primitives exist.

## What Changes

- **Shared domain types**: TypeScript interfaces for all core concepts (channels, roles, permissions, plans, symbols, assumptions, iterations)
- **Discord constants**: Permission name→bitfield map, channel types, plan statuses, snapshot types
- **Tool Zod schemas**: Zod validation schemas for all 14 tools (3 category, 4 channel, 4 role, 2 permission, 1 interaction) — schema definitions only, no plan()/execute() logic yet
- **Bot state formatter**: Function that converts the bot's in-memory cache into structured text format for LLM context (as specified in ProjectDescription.md Section 2.D)
- **Bot cache query helpers**: Utility functions for cache lookups (by name, by type, by parent)
- **Rules CRUD API**: Full REST endpoints for server rules (create, list, update, delete)
- **Guild API**: Endpoints to list guilds from bot cache and get/update guild settings

## Capabilities

### New Capabilities
- `shared-types`: Domain TypeScript interfaces and Discord constants in packages/shared. Includes types for channels, roles, permissions, plans, symbols, assumptions, iterations, and server state.
- `tool-schemas`: Zod validation schemas for all 14 planning tools (category, channel, role, permission, and interaction tools). Schema-only — plan()/execute() implementations deferred.
- `bot-state-formatter`: Bot in-memory cache → structured text conversion for LLM context consumption. Implements the format specified in ProjectDescription.md Section 2.D.
- `rules-api`: CRUD REST API for server rules (POST/GET/PUT/DELETE) backed by the existing rules table.
- `guild-api`: REST endpoints for listing user-accessible guilds (from bot cache) and getting/updating guild settings.

### Modified Capabilities
<!-- No existing spec-level requirements are being changed. -->
_None._

## Impact

- **packages/shared**: New domain type files, constants, and Zod tool schemas (currently empty)
- **apps/server/src/bot/cache.ts**: Add structured text formatter + query helper exports
- **apps/server/src/hono/app.ts**: Mount new guild and rules route modules
- **packages/db**: Referenced for rules queries but no schema changes needed
