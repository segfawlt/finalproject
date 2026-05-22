# Plan Storage & Rollback

## Plan JSON Structure

Each plan is stored as JSON with:

```
Plan {
  metadata:        id, guildId, userId, status, userPrompt, serverType
  llm_response:    summary, reasoning (displayed in Studio text panel)
  desired_state:   Complete virtual state at approval time
  execution_steps: Flat array, topologically sorted
                   { index, toolName, resolvedParams, status, result, error }
  symbol_table:    Maps $symbol → type, definingStepIndex, resolvedDiscordId
  assumptions:     Flat list of pre-execution checks
  iterations:      Versioned snapshots of desired state
  snapshots:       snapshot_before, snapshot_after (from bot cache)
  results:         created[], modified[], deleted[] (Discord resource IDs)
  error:           Error details if plan failed
}
```

### Status State Machine

```
draft → validated → approved → executing → completed
                                  │
                                  ▼
                                failed → rolled_back
```

### Params vs resolved_params

The LLM's original tool calls are NOT stored — only the final desired state at each iteration matters. Execution steps store `resolvedParams` with real Discord IDs. This enables debugging and rollback.

---

## Iterations

Each user prompt or manual edit creates a versioned iteration snapshot:

- `version`: auto-increment
- `type`: `llm_generated` | `manual_edit` | `revert`
- `desiredState`: full ServerState at that point
- `timestamp`
- Current iteration pointer tracks which is active

Users can view, revert to, or continue from any past iteration. Reverting creates a new iteration — nothing is deleted (git-like).

---

## Snapshots

### Types

| Type | Purpose | TTL |
|------|---------|-----|
| execution_before | Audit trail, rollback source | Permanent |
| execution_after | Audit trail | Permanent |
| role_deletion | Member list for rollback re-assignment | 1 month |
| plan_state | State at plan creation time | Until plan completes |

### Schema

```
snapshots:
  id, type, guild_id, plan_id, data (JSON), created_at, expires_at, metadata

role_snapshot_members:
  id, snapshot_id (FK), user_id, username

Indexes:
  (guild_id, type)       — fast lookup per guild
  (expires_at)            — TTL cleanup
  (plan_id)               — plan history lookups
```

### Cleanup

Daily scheduled job deletes rows where `expires_at < NOW()`. For role snapshots, also cleans member list rows.

---

## Rollback

Generates an **inverse plan** from the before-snapshot:

- Recreates deleted channels/categories/roles structurally
- Content (messages, member assignments) cannot always be restored
- Warns user about irreversible losses before executing

After rollback, plan status → `rolled_back`.

---

## Error Handling

| Error | Action |
|-------|--------|
| 500/502/503/timeout | Retry step 3x, exponential backoff + jitter |
| 403 (permissions) | Check bot role position, channel overwrites. Fix map suggests solution. |
| 404 (not found) | Resource deleted since plan creation. Suggest refresh + retry. |
| 429 (rate limit) | Discord.js REST manager handles automatically |
| Unknown | LLM receives error + state + step, suggests cause and fix |
| Permanent failure | Roll back ALL completed steps. No partial state. User: Retry or Revise. |
