# Implementation Plan — Phase System & lockPermissions

Status: Spec complete, ready for implementation. Last updated: 2026-05-28.

## Execution Order

```
1. Part A — Fix buildSystemPrompt()          (1 file, ~40 lines changed)
2. Part B — lockPermissions                  (8 files, all additive)
```

Part A first because the system prompt controls LLM behavior — Part B
depends on the LLM understanding the correct phase model and permission strategy.

---

## Part A: Fix `buildSystemPrompt()` — Phase Model Sync

**File:** `apps/server/src/planning/planning-session.ts` (lines 478–502)

The code's system prompt uses the old phase model:

- Phase 1: Server Structure (Roles + Categories + Channels)
- Phase 2: Channel Configuration
- Phase 3: Permissions
- Phase 4: Member Assignments

The updated phase model separates concerns:

```
Phase 1 — Foundation (Roles only)
Phase 2 — Server Layout (Categories + channels)
Phase 3 — Access Control (Overwrites, lockPermissions)
Phase 4 — People (Member role assignments)
```

### Exact replacement

Replace lines 478–502 of `apps/server/src/planning/planning-session.ts`:

```ts
lines.push("Planning phases (complete each before moving to the next):");
lines.push("  Phase 1 — Foundation: Roles only (create/edit/delete/move_role).");
lines.push("           Do NOT create categories, channels, or set overwrites in this phase.");
lines.push("  Phase 2 — Server Layout: Categories + channel structure.");
lines.push("           Tools: create/edit/delete/move_category, create/edit/delete/move_channel.");
lines.push("           Default lock_permissions: true on channels under categories.");
lines.push("           Do NOT modify roles or set permission overwrites in this phase.");
lines.push("  Phase 3 — Access Control: Channel/category overwrites.");
lines.push("           Tools: set_overwrite, remove_overwrite, batch_set_overwrite.");
lines.push("");
lines.push("  PERMISSION STRATEGY:");
lines.push("  - Default: lock_permissions: true on channels under a category.");
lines.push("    Set overwrites on the CATEGORY, not individual channels.");
lines.push("  - Scan channels within each category for identical overwrite patterns.");
lines.push("    When found, propose consolidation: move overwrites to the category");
lines.push("    level and sync the channels.");
lines.push("  - If ONE channel needs different permissions than its category:");
lines.push("    lock_permissions: false on that channel, add specific overwrites.");
lines.push("  - If MOST channels in a category need different permissions:");
lines.push("    skip category-level overwrites entirely. Set per-channel.");
lines.push("  - When uncertain whether a channel should be synced or independent,");
lines.push("    use ask_user to clarify. Do not guess.");
lines.push("  - Do NOT set the same overwrites on every channel in a category.");
lines.push("    Put them on the category once.");
lines.push("  - Do NOT create new channels or modify roles in this phase.");
lines.push("  Phase 4 — People: Member role assignments.");
lines.push("           Tools: add_role_to_member, remove_role_from_member.");
lines.push("           Do NOT create roles or modify permissions in this phase.");
```

Also update the risk note on line 501:

```ts
"- If the user asks for Phase N+1 work without Phases 1..N complete, you MAY proceed but MUST note the risk in your summary.";
```

### Verification

```bash
pnpm tsc --noEmit -p apps/server/tsconfig.json
```

No runtime changes — only system prompt text. LLM behavior changes immediately
after deploy.

---

## Part B: lockPermissions — Category-Level Permission Inheritance

Discord.js v14 has full native support:

| API                                           | Type                               | Used for                                     |
| --------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| `channel.permissionsLocked`                   | Getter (`boolean \| null`)         | Read sync state. `null` = no parent category |
| `channel.edit({ lockPermissions })`           | Param in `GuildChannelEditOptions` | Set via edit                                 |
| `guild.channels.create({ lockPermissions })`  | Param in create options            | Set at creation                              |
| `channel.lockPermissions()`                   | Method                             | Trigger re-sync                              |
| `channel.setParent(cat, { lockPermissions })` | `SetParentOptions`                 | Sync on category change                      |

### B1. `packages/shared/src/types.ts`

Add to `ChannelBase` interface (after `flags` on line 30):

```ts
  lockPermissions?: boolean;
```

### B2. `packages/shared/src/tools/channels.ts`

Add to `createChannelSchema` (after `flags` on line 35):

```ts
  lock_permissions: z.boolean().optional(),
```

Add to `editChannelSchema` (after `flags` on line 54):

```ts
  lock_permissions: z.boolean().optional(),
```

Update `planChannelCreate` to pass `lockPermissions` to store:

```ts
// In the addChannel call within planChannelCreate, add:
lockPermissions: params.lock_permissions,
```

Update `planChannelEdit` similarly.

Update `executeChannelCreate` and `executeChannelEdit` to pass `lockPermissions`
to the ExecuteContext call:

```ts
// In executeChannelCreate, add to the params object:
lockPermissions: params.lock_permissions,
// In executeChannelEdit, add to the params object:
lockPermissions: params.lock_permissions,
```

### B3. `packages/shared/src/tools/registry.ts`

Update `edit_channel` tool description (line 198–199):

```ts
description:
  "Edit an existing channel. Use this to rename, reparent, " +
  "change settings, or toggle lock_permissions to sync or " +
  "un-sync channel permissions from its parent category.",
```

### B4. `packages/shared/src/state/desired-state-store.ts`

Update `addChannel` signature to accept `lockPermissions?: boolean`. Store it on
the `ChannelBase` object:

```ts
addChannel(params: { ...; lockPermissions?: boolean }): string {
  // ... existing logic ...
  const channel: ChannelBase = {
    // ... existing fields ...
    lockPermissions: params.lockPermissions,
  };
}
```

Update `editChannel` similarly — if `lockPermissions` is provided in the edit
fields, update it on the stored channel object.

### B5. `packages/shared/src/state/fork.ts`

Discord.js exposes `channel.permissionsLocked` — no heuristic needed. In the
loop that builds channel objects from Discord state, add:

```ts
// After building the ChannelBase object:
lockPermissions: discordChannel.permissionsLocked ?? undefined,
```

`permissionsLocked` returns `null` for channels without a parent category.
Convert to `undefined` for the optional `ChannelBase.lockPermissions` field.

The bot must ensure channels are fetched with their `permissionsLocked` property
populated. During startup (`bot/index.ts`), `guild.channels.fetch()` includes
this data by default in Discord.js v14.

### B6. `packages/shared/src/execute-context.ts`

Update `CreateChannelParams` and `EditChannelParams` interfaces:

```ts
// Add to CreateChannelParams:
lockPermissions?: boolean;

// Add to EditChannelParams:
lockPermissions?: boolean;
```

### B7. `apps/server/src/bot/execute-context.ts`

Pass `lockPermissions` to Discord.js in `createChannel` and `editChannel`:

```ts
// In createChannel (DiscordExecuteContext):
await this.guild.channels.create({
  name: params.name,
  // ... existing params ...
  lockPermissions: params.lockPermissions,
});

// In editChannel:
await channel.edit({
  // ... existing params ...
  lockPermissions: params.lockPermissions,
});
```

Discord.js natively accepts `lockPermissions` in both methods.

### B8. `apps/server/src/planning/diff-engine.ts`

Three changes:

**a) Add `arraysEqualSorted` helper** (alongside existing `arraysEqual` on line 229):

```ts
function arraysEqualSorted(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}
```

**b) Extend `generateOverwriteSteps` signature:**

```ts
// Before:
function generateOverwriteSteps(
  desired: Record<string, PermissionOverwrite>,
  real: PermissionOverwrite[]
): RawStep[];

// After:
function generateOverwriteSteps(
  desired: Record<string, PermissionOverwrite>,
  real: PermissionOverwrite[],
  desiredChannels: Record<string, ChannelBase>
): RawStep[];
```

**c) Skip overwrite generation for synced channels.**

Before emitting a `set_overwrite` for a channel, check:

```ts
// At the top of the loop processing each overwrite key:
const parts = key.split(":");
const channelId = parts[0];
const ch = desiredChannels[channelId] ?? desiredChannels[`$${channelId}`];
if (ch?.lockPermissions === true) continue; // Skip — category handles it
```

**d) Emit lockPermissions in channel edit steps.**

In `generateChannelSteps`, when an existing channel's `lockPermissions` field
differs from the real state, include it in the `edit_channel` params:

```ts
// Inside generateChannelSteps, in the edit diff section:
if (ch.lockPermissions !== realCh?.lockPermissions) {
  params.lock_permissions = ch.lockPermissions;
}
```

Also include `lockPermissions` in `create_channel` params from desired state.

### B9. `apps/server/src/planning/validation.ts`

Add to Group D (Safety Guards, after line 322):

```ts
// Detect channels with identical overwrites but lockPermissions: false
function validateOverwriteConsolidation(
  steps: PlanStep[],
  desiredState: DesiredState
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const channels = Object.values(desiredState.active.channels);

  // Group channels by parent category
  const byCategory = new Map<string, ChannelBase[]>();
  for (const ch of channels) {
    if (!ch.parentId) continue;
    const list = byCategory.get(ch.parentId) ?? [];
    list.push(ch);
    byCategory.set(ch.parentId, list);
  }

  for (const [, children] of byCategory) {
    if (children.length < 2) continue;

    // Build overwrite signatures for each un-synced channel
    for (let i = 0; i < children.length; i++) {
      const a = children[i];
      if (a.lockPermissions !== false) continue;
      const aOverwrites = getOverwritesFor(a.id, desiredState.active.overwrites);

      for (let j = i + 1; j < children.length; j++) {
        const b = children[j];
        if (b.lockPermissions !== false) continue;
        const bOverwrites = getOverwritesFor(b.id, desiredState.active.overwrites);

        if (overwritesEqual(aOverwrites, bOverwrites)) {
          issues.push({
            group: "D. Safety",
            message: `Channels ${a.name} and ${b.name} have identical permissions but are not synced to their category`,
            severity: "warning",
          });
          break; // Report once per channel
        }
      }
    }
  }

  return issues;
}
```

Wire into `validatePlan()`:

```ts
...validateOverwriteConsolidation(steps, desiredState),
```

---

## Verification Commands

After each part:

```bash
pnpm tsc --noEmit -p apps/server/tsconfig.json
pnpm tsc --noEmit -p apps/web/tsconfig.json
pnpm lint
```

---

## File Change Summary

| #   | File                                               | Change                                                                                       | Part |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- |
| 1   | `apps/server/src/planning/planning-session.ts`     | Replace phase model + add PERMISSION STRATEGY                                                | A    |
| 2   | `packages/shared/src/types.ts`                     | `lockPermissions?: boolean` on `ChannelBase`                                                 | B    |
| 3   | `packages/shared/src/tools/channels.ts`            | `lock_permissions` param on create/edit schemas                                              | B    |
| 4   | `packages/shared/src/tools/registry.ts`            | Update `edit_channel` description                                                            | B    |
| 5   | `packages/shared/src/state/desired-state-store.ts` | Pass lockPermissions through addChannel/editChannel                                          | B    |
| 6   | `packages/shared/src/state/fork.ts`                | Read `permissionsLocked` from Discord.js channel                                             | B    |
| 7   | `packages/shared/src/execute-context.ts`           | Add lockPermissions to create/edit channel params                                            | B    |
| 8   | `apps/server/src/bot/execute-context.ts`           | Pass lockPermissions to Discord.js methods                                                   | B    |
| 9   | `apps/server/src/planning/diff-engine.ts`          | `arraysEqualSorted`, skip overwrites for synced channels, emit lockPermissions in edit steps | B    |
| 10  | `apps/server/src/planning/validation.ts`           | Group D: overwrite consolidation detection                                                   | B    |

**Total: 10 files (all additive touches)**
