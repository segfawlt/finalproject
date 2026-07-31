# Security & Safety

## Bot ADMINISTRATOR Requirement

The bot MUST have ADMINISTRATOR in every guild it operates in.

- On startup: check each guild
- Lacking ADMINISTRATOR → guild marked as blocked
- All API operations rejected with clear error
- Studio shows banner: "Bot needs Administrator permission"
- ADMINISTRATOR bypasses all channel overwrites → bot can never be locked out
- Because the bot holds ADMINISTRATOR, denying @everyone VIEW_CHANNEL cannot lock
  the bot out, so it is allowed without a block or warning

## Authentication

- Better Auth with Discord OAuth2 provider (self-hosted, open source, type-safe)
- Hono middleware validates session on every request
- Session stored as HTTP-only cookie on app domain
- Authorization is per-guild: every guild-scoped route checks
  `userHasManageGuild(userId, guildId)` (Discord `MANAGE_GUILD` permission,
  verified live against the Discord API). There is no app-level role system.
- No RBAC roles (`super_admin`/`admin`/`user`) and no Better Auth organizations /
  multi-tenancy — access is derived entirely from Discord guild permissions.
- A `subscriptionTier` column exists on the user table (defaults to `"free"` and
  is surfaced in the session), but nothing reads it — there are no tier gates,
  feature flags, or `pro`/`enterprise` code paths. Tiered features are unbuilt.

## Guild-Level Concurrent Plan Locking

Only one plan can execute per guild at a time.

- `current_plan_id` column on `guilds` table (exists in schema, locking logic to be implemented)
- Simple lock — no distributed coordination needed in monolith
- Later plans re-validated against state after earlier plans complete
- Queue: plans wait naturally, no explicit queue structure needed yet
- On process startup: clear all `current_plan_id` values (stale locks from crashes)

## Bot Role Hierarchy

The bot MUST be at the highest role position in every guild it operates in,
alongside the ADMINISTRATOR requirement. Both are hard requirements — neither
can be a warning.

- On startup: check each guild for both ADMINISTRATOR and highest role position
- Lacking either → guild marked as blocked
- Validation BLOCK: any plan step that modifies a role above the bot's position
  is rejected with a clear error message
- Error message: "Bot cannot execute this plan. Its highest role (position X)
  is below a role this plan modifies (position Y). Move the bot's role to the
  top of the role list and try again."
- Manual setup step guided by onboarding flow — bot's role should be dragged
  to the top of the role list in Discord server settings

## Least Privilege

Requests only specific permissions per action via Discord OAuth2 scope. The bot's ADMINISTRATOR permission is used at the gateway level, not per-request.

## Pre-Execution Validation

Fresh state read from Discord API before execution:

- Bot role position still matches?
- Referenced roles/channels still exist?
- No name conflicts for new items?
- Guild still exists and bot is in it?

Any assumption fails → conflict flagged → user chooses how to proceed.

## Destructive Action Warnings

Before executing plans with destructive actions:

- Deleted items shown in red in the clone
- Message count / category child count displayed
- IMPORTANT channels require explicit confirmation to delete

## Error Handling Safety

- No partial state ever left on Discord server
- Full rollback on permanent failure via tracked Discord IDs from completedSteps
- Hardcoded fix map for known errors (403, 404, 429, 500, 502, 503, timeout)
- Unknown errors: fail, rollback, offer re-plan — never consult the LLM for runtime diagnosis
- Retry with backoff for transient errors
