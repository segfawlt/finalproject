# Security & Safety

## Bot ADMINISTRATOR Requirement

The bot MUST have ADMINISTRATOR in every guild it operates in.

- On startup: check each guild
- Lacking ADMINISTRATOR → guild marked as blocked
- All API operations rejected with clear error
- Studio shows banner: "Bot needs Administrator permission"
- ADMINISTRATOR bypasses all channel overwrites → bot can never be locked out
- @everyone VIEW_CHANNEL denial becomes a WARNING (not block)

## Authentication

- Better Auth with Discord OAuth2 provider (self-hosted, open source, type-safe)
- Hono middleware validates session on every request
- Session stored as HTTP-only cookie on app domain
- User must have "Manage Server" permission in Discord to access guild dashboard
- User roles: `super_admin`, `admin`, `user`
- Multi-tenant via Better Auth organizations feature
- Subscription tiers: `free`, `pro`, `enterprise` (feature flags, deferred)

## Guild-Level Concurrent Plan Locking

Only one plan can execute per guild at a time.

- `current_plan_id` column on `guilds` table
- Simple lock — no distributed coordination needed in monolith
- Later plans re-validated against state after earlier plans complete
- Queue: plans wait naturally, no explicit queue structure needed yet

## Bot Role Hierarchy

- Bot should be at highest role position
- If it cannot execute an action due to hierarchy: reports problem, suggests fixes
- Manual setup step guided by onboarding flow

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
- Full rollback on permanent failure
- Hardcoded fix map for known errors (403, 404, 429, 500)
- LLM fallback for unknown errors
- Retry with backoff for transient errors
