# Appendix B: Database Data Dictionary

This appendix documents the implemented PostgreSQL schema from
`packages/db/src/schema.ts`. It supplements the entity--relationship diagram in
Section 4.3; it is a reference for the as-built database, not a separate
proposed design. `jsonb` fields retain complete domain documents because the
application reads and writes them as whole values.

## B.1 Authentication Tables

| Table | Purpose | Primary key | Foreign keys | Main stored data |
| --- | --- | --- | --- | --- |
| `users` | Better Auth user record, extended for Discord identity and application role. | `id` (text) | None | Name, email, verified flag, image, Discord ID, subscription tier, role, created/updated timestamps. |
| `sessions` | Authenticated browser sessions. | `id` (text) | `user_id` → `users.id` | Unique token, expiry, IP address, user agent, created/updated timestamps. |
| `accounts` | OAuth account and token record managed by Better Auth. | `id` (text) | `user_id` → `users.id` | Provider/account IDs, access and refresh tokens, expiries, scope, ID token, and timestamps. |
| `verifications` | Time-limited Better Auth verification records. | `id` (text) | None | Identifier, value, expiry, created/updated timestamps. |

## B.2 Guild Configuration and Audit Tables

| Table | Purpose | Primary key | Foreign keys | Main stored data and indexes |
| --- | --- | --- | --- | --- |
| `guilds` | Discord guild anchor and execution-lock state. | `id` (text, Discord guild ID) | None | Name, icon, type, settings JSON, subscription tier, current plan ID, lock owner/acquisition/heartbeat, created/updated timestamps. |
| `conversations` | A user's planning conversation for one guild. | `id` (UUID) | `guild_id` → `guilds.id`; `user_id` → `users.id` | Status, original prompt, messages JSON, fork-state hash, timestamps. Indexed by `guild_id`. |
| `plan_iterations` | Immutable desired-state version within a conversation. | `id` (UUID) | `conversation_id` → `conversations.id` | Version, iteration type, desired-state JSON, creation timestamp. Indexed by conversation; `(conversation_id, version)` is unique. |
| `plans` | Reviewed execution contract generated from a conversation. | `id` (UUID) | `guild_id` → `guilds.id`; `user_id` → `users.id`; optional `conversation_id` → `conversations.id` | Status, prompt, server type, plan-data JSON, execution/completion timestamps, error JSON. Indexed by guild and user. |
| `snapshots` | Before/after guild-state records used for recovery and rollback. | `id` (UUID) | `guild_id` → `guilds.id`; optional `plan_id` → `plans.id` | Snapshot type, state JSON, expiry, metadata JSON, creation timestamp. Indexed by `(guild_id, type)`, expiry, and plan ID. |
| `rules` | Administrator-defined natural-language constraints for a guild. | `id` (UUID) | `guild_id` → `guilds.id` | Rule text and timestamps. Indexed by guild. |
| `templates` | Reusable configuration templates, either global or guild-scoped. | `id` (text) | optional `guild_id` → `guilds.id`; optional `author_id` → `users.id` | Version, name, description, structure JSON, validation-rules JSON, category, tags, official flag, status, timestamps. Indexed by guild. |
| `drift_events` | Persisted notifications of Discord changes outside an active plan. | `id` (UUID) | `guild_id` → `guilds.id` | Severity, event kind, summary, details JSON, creation and resolution timestamps. Indexed by `(guild_id, created_at)` and `(guild_id, resolved_at)`. |

## B.3 Data-Handling Notes

- Guild-scoped records use `guild_id` as the tenant boundary. Route and helper
  authorization checks enforce that boundary before database records are exposed.
- `plans.plan_data`, `plan_iterations.desired_state`, and `snapshots.data` hold
  declarative state or execution documents. Their contents are validated by the
  application rather than queried as independent relational entities.
- `snapshots.expires_at` supports retention cleanup. Authentication-table
  columns are managed through Better Auth; the platform code uses raw SQL only
  where that library's table shape is required.

