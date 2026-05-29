# Channel & Role Tool Gaps

Gaps identified during audit of the tool registry against Discord API coverage for
channels, roles, categories, and permissions. Session date: May 27, 2026.
Updated: May 28, 2026.

---

## Gap 1: Member-Targeted Permission Overwrites

**Status:** SKIP — not needed

**Problem:** `set_overwrite` and `remove_overwrite` only accept `role_id`. Discord's
overwrite object supports both role (type 0) and member (type 1) targets. No way
to apply channel permissions to specific members.

**Decision:** Skipped. Use case ("deny @Bob on #channel") is niche, adds target-type
complexity to every overwrite call, requires data model changes to `PermissionOverwrite`,
`ExecuteContext`, and `DesiredStateStore`. The LLM would also need to know member IDs,
which it currently has no way to reference.

---

## Gap 2: Forum & Media Channel Properties

**Status:** IMPLEMENTED — all 6 properties added

All forum/media properties are fully implemented:
- `available_tags`, `default_reaction_emoji`, `default_sort_order`, `default_forum_layout`,
  `default_thread_rate_limit_per_user`, `flags` — all in Zod schemas, `ChannelBase` type,
  store, ExecuteContext interface + Discord.js implementation, and registry descriptions.

---

## Gap 3: Role Tags (Display-Only)

**Status:** IMPLEMENTED

`RoleTags` interface exists in `packages/shared/src/types.ts:42-50` with fields:
`botId`, `botName`, `integrationId`, `premiumSubscriber`, `subscriptionListingId`,
`availableForPurchase`, `guildConnections`. The `Role` type includes `tags?: RoleTags`.
The bot already knows its client ID via `botClient.user.id` for matching.

---

## Gap 4: Media Channel Type

**Status:** IMPLEMENTED (bundled with Gap 2)

`"media"` is in `channelTypeEnum` in `packages/shared/src/tools/channels.ts:6`.
Maps to Discord type 16. Shares all forum properties from Gap 2.

---

## Gap 5: Batch `set_overwrite` Tool

**Status:** IMPLEMENTED

`batch_set_overwrite` registered in `TOOL_REGISTRY`. Accepts an array of
`{ channel_id, role_id, allow?, deny? }` entries. `planOverwriteBatch()` loops
over the array, calling `store.setOverwrite` for each entry. Execution mode is
`planning_only` — the diff engine decomposes the batch into individual
`set_overwrite` steps at execution time.

See `packages/shared/src/tools/registry.ts:445` and `packages/shared/src/tools/permissions.ts`.

---

## Gap 6: Member Management

**Status:** IMPLEMENTED — see [docs/design/member-role-management.md](../design/member-role-management.md)

Two new tools implemented: `add_role_to_member` and `remove_role_from_member`.
Member role assignments in `DesiredState.active.memberRoles`, keyed by Discord
user ID. Symmetric diffing (no tombstones). Member ops run in Phase 4 (People)
of the planning model. Full tool chain: Zod schemas → plan() → execute() →
ExecuteContext → Discord.js implementation.

Remaining work on member management: configuration procedure (#24), which replaces
the original guided setup flow with a passive sidebar checklist.

**Scope (implemented):** Add/remove role from member. Nickname, kick, ban,
timeout deferred.

---

## Gap 7: Channel Category Sync (lockPermissions)

**Status:** IN DESIGN (updated 2026-05-28). Full design in [docs/design/member-role-management.md](../design/member-role-management.md#lockpermissions--category-level-permission-inheritance)

**Problem:** Discord's `lockPermissions` property allows channels to inherit
their parent category's permission overwrites. Not yet implemented.

**Updated design (2026-05-28):**

- **Reading sync state — heuristic:** Compare channel overwrites to category's.
  Identical → synced. Discord's own client uses the same comparison.
- **Auto-de-sync as safety net:** Modifying overwrites on a synced channel
  silently de-syncs it (Discord behavior). No error handling needed.
- **Diff engine:** Skip per-channel overwrite generation for synced channels.
  `arraysEqualSorted` helper for sorted-set permission comparison.
- **System prompt:** PERMISSION STRATEGY — default to `lock_permissions: true`,
  permissions on categories, not individual channels.
- **"Fix This" pattern:** Validation Group D detects channels with identical
  overwrites but `lockPermissions: false`. One-click consolidation via `revise`.

**Files:** 8 files (all additive, no conflicts with member roles):
`types.ts`, `tools/channels.ts`, `registry.ts`, `desired-state-store.ts`,
`diff-engine.ts`, `bot/execute-context.ts`, `planning-session.ts`, `validation.ts`.

---

## Skipped Gaps (Decision Log)

| Gap                                                                   | Reason                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Server-level settings (name, icon, verification, AFK, system channel) | Out of scope for now; focus on channels/roles/categories/permissions                                |
| Voice channel properties (`rtc_region`, `video_quality_mode`)         | Rarely configured by admins; core voice config already covered                                      |
| Thread tools (create/edit/delete/archive)                             | Threads are user-created, not admin-structural; forum channels handle thread creation automatically |
| Member overwrite targets                                              | See Gap 1 — niche use case                                                                          |
| Invites, emojis, stickers, webhooks                                   | Auxiliary resources, not core to server structure config                                            |
