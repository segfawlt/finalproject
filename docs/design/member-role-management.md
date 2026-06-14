# Member Role Management

Declarative member role assignment within the DesiredState model. Implements Gap 6
from [channel-role-gaps.md](../issues/channel-role-gaps.md#gap-6-member-management).

## Overview

Member role assignments live in `DesiredState.active.memberRoles`, keyed by
Discord user ID. The LLM plans member role changes declaratively — the diff engine
compares desired vs. real member roles and generates add/remove steps. Symmetric
diffing (no tombstones). Members use Discord IDs (no symbols — the bot can't
create members).

Member role management is **Phase 4 (People)** of the 4-phase planning model (see
[Phased Planning](#phased-planning)). It is the final phase, executing after
Foundation (roles), Server Layout (categories + channels), and Access Control
(permissions) are finalized. The planning model also supports `lockPermissions`
for category-level permission inheritance — see [lockPermissions](#lockpermissions--category-level-permission-inheritance).

## Data Model

### New Types (`packages/shared/src/types.ts`)

```typescript
interface Member {
  id: string;       // Discord user ID
  username: string;
}

interface MemberRoleAssignment {
  memberId: string;   // Discord user ID — always real, never a symbol
  roleIds: string[];  // Role IDs (real or $role_N symbols)
}

// DesiredStateActive extension
active: {
  channels:     Record<string, ChannelBase>;
  roles:        Record<string, Role>;
  overwrites:   Record<string, PermissionOverwrite>;
  memberRoles:  Record<string, MemberRoleAssignment>; // NEW — keyed by memberId
}

// ServerState extension (flat array, input to fork())
memberRoles: MemberRoleAssignment[];
members: Member[];
```

### Design Decisions

- **Member ID is always a Discord ID.** The bot cannot create members, so there
  are no symbols for members. The LLM references members by their real Discord
  user IDs, resolved from the member summary in the system prompt.
- **Role IDs can be symbols or real IDs.** A role created during the same plan
  (represented by `$role_0`) can be assigned to a member before the role exists
  on Discord. The diff engine's topological sort ensures the role is created first.
- **Symmetric diffing** — no tombstones. If a member's role assignment differs
  between desired and real state, the diff engine emits `add_role_to_member`
  or `remove_role_to_member` steps. If a member leaves the guild between planning
  and execution, pre-execution validation catches it.
- **No per-member permissions.** Member-targeted overwrites (Gap 1) were
  explicitly skipped. Member access to channels is determined entirely by
  their role assignments, not by member-specific overwrites.

## Tools

### `add_role_to_member`

```
Params:
  member_id: string  — Discord user ID of the member
  role_id: string    — Role ID (real or $role_N symbol)

Execution mode: planning_and_execution
Execution order: 9 (after create_role, before set_overwrite)
```

### `remove_role_from_member`

```
Params:
  member_id: string  — Discord user ID of the member
  role_id: string    — Role ID (real or $role_N symbol)

Execution mode: planning_and_execution
Execution order: 10
```

### Tool Registry Changes

Add two new entries to `TOOL_REGISTRY` in `packages/shared/src/tools/registry.ts`.
Both follow the existing pattern: Zod schema → plan function → execute function →
getAssumptions function (all defined in `tools/members.ts`).

### New File: `packages/shared/src/tools/members.ts`

```
Structure (same pattern as roles.ts, channels.ts, etc.):
  - Zod schemas (createMemberRoleSchema, removeMemberRoleSchema)
  - plan() functions → calls DesiredStateStore
  - execute() functions → calls ExecuteContext
  - getAssumptions() → member_exists, role_assigned
```

## DesiredStateStore Extensions

New methods on `DesiredStateStore` in `packages/shared/src/state/desired-state-store.ts`:

```typescript
addMemberRole(memberId: string, roleId: string): void
  // Validates: memberId not empty, role exists in active.roles
  // Creates MemberRoleAssignment if not exists, adds roleId to roleIds array
  // No symbol generation (members are real Discord IDs)
  // No duplicate insertion (roleId already present → warn, don't add twice)

removeMemberRole(memberId: string, roleId: string): void
  // Validates: memberId exists in active.memberRoles, roleId exists in their roleIds
  // Removes roleId from array
  // If member has no roles left (beyond @everyone), keep empty entry
  //   (absence from desired state = no changes requested)
```

### Validation (Store-Level)

| Operation        | Store-Level Checks                        |
| ---------------- | ----------------------------------------- |
| addMemberRole    | Role reference exists in active.roles     |
| removeMemberRole | Member entry exists in active.memberRoles |
| addMemberRole    | No duplicate role assignment              |

## Fork Extension

`fork()` in `packages/shared/src/state/fork.ts` is extended to populate
`active.memberRoles` from `ServerState.memberRoles`:

```typescript
const memberRoles: Record<string, MemberRoleAssignment> = {};
for (const mr of serverState.memberRoles) {
  memberRoles[mr.memberId] = structuredClone(mr);
}
// Add to active: { ..., memberRoles }
```

Members are fetched from Discord at fork time (via `Guild.members.fetch()`) and
stored in `ServerState`. For large servers, pagination handles up to 1000 members.
Members beyond Discord's fetch limit (1000) are not included — large servers
have too many members for declarative management anyway.

## Diff Engine

### Phase 1: Member Role Steps

New function `generateMemberRoleSteps()` in `apps/server/src/planning/diff-engine.ts`:

```typescript
function generateMemberRoleSteps(
  desired: Record<string, MemberRoleAssignment>,
  real: MemberRoleAssignment[]
): RawStep[] {
  const steps: RawStep[] = [];
  const realByMember = new Map(real.map((m) => [m.memberId, new Set(m.roleIds)]));

  for (const [memberId, assignment] of Object.entries(desired)) {
    const desiredRoles = new Set(assignment.roleIds);
    const realRoles = realByMember.get(memberId) ?? new Set();

    // Roles to add (in desired, not in real)
    for (const roleId of desiredRoles) {
      if (!realRoles.has(roleId)) {
        steps.push({
          toolName: "add_role_to_member",
          params: { member_id: memberId, role_id: roleId },
          symbolsReferenced: isSymbol(roleId) ? [roleId] : [],
        });
      }
    }

    // Roles to remove (in real, not in desired)
    for (const roleId of realRoles) {
      if (!desiredRoles.has(roleId)) {
        steps.push({
          toolName: "remove_role_from_member",
          params: { member_id: memberId, role_id: roleId },
          symbolsReferenced: [],
        });
      }
    }
  }

  return steps;
}
```

### Updated TOOL_ORDER

```
 3: create_role                 (unchanged)
 9: add_role_to_member           ← NEW
10: remove_role_from_member      ← NEW
11: set_overwrite                (shifted from 9)
12: remove_overwrite             (shifted from 10)
```

Member role steps run after role creation (symbols must resolve) but before
overwrites. The topological sort ensures `$role_0` is created before any member
is assigned to it.

### Wired into diffEngine()

```typescript
export function diffEngine(realState, desiredState): DiffResult {
  const rawSteps = [
    ...generateChannelSteps(...),
    ...generateRoleSteps(...),
    ...generateMemberRoleSteps(desiredState.active.memberRoles, realState.memberRoles), // NEW
    ...generateOverwriteSteps(...),
    ...generateTombstoneSteps(...),
  ];
  // ... rest unchanged
}
```

## ExecuteContext Interface

New methods on `ExecuteContext` in `packages/shared/src/execute-context.ts`:

```typescript
addRoleToMember(memberId: string, roleId: string): Promise<void>;
removeRoleFromMember(memberId: string, roleId: string): Promise<void>;
```

### Discord.js Implementation (`apps/server/src/bot/execute-context.ts`)

```typescript
async addRoleToMember(memberId: string, roleId: string): Promise<void> {
  const member = await this.guild.members.fetch(memberId);
  const role = this.guild.roles.cache.get(roleId);
  if (!role) throw new Error(`Role ${roleId} not found`);
  await member.roles.add(role);
}

async removeRoleFromMember(memberId: string, roleId: string): Promise<void> {
  const member = await this.guild.members.fetch(memberId);
  await member.roles.remove(roleId);
}
```

## Execution Engine

### Dispatch Cases (`apps/server/src/planning/execution-engine.ts`)

Two new cases in the `dispatchStep()` switch statement, following the existing pattern:

```typescript
case "add_role_to_member":
  await executeMemberRoleAdd(resolvedParams, ctx);
  return {};
case "remove_role_from_member":
  await executeMemberRoleRemove(resolvedParams, ctx);
  return {};
```

### Symbol Resolution

Member tools don't create symbols (members use Discord IDs), but role params
may be symbols (`$role_0`). The existing `resolveSymbols()` function in
`execution-engine.ts` already handles symbol-to-ID substitution for all params —
no changes needed.

## Validation (`apps/server/src/planning/validation.ts`)

New member-specific checks in validation groups:

### Group A: Permission

| Check                                                                | Severity |
| -------------------------------------------------------------------- | -------- |
| Bot tries to assign/remove role above its own position               | BLOCK    |
| Bot role position < target role position (can't assign higher roles) | BLOCK    |

### Group B: Dependency

| Check                                               | Severity |
| --------------------------------------------------- | -------- |
| Role ID doesn't exist in plan or guild (real IDs)   | BLOCK    |
| Symbol role referenced but not created in same plan | BLOCK    |

### Group C: Resource

| Check                                                     | Severity |
| --------------------------------------------------------- | -------- |
| Member ID not in guild (fetched fresh at validation time) | BLOCK    |
| Duplicate add + remove for same (member, role) pair       | BLOCK    |

## System Prompt Design

### Phased Planning

The system prompt in `planning-session.ts#buildSystemPrompt()` enforces a
4-phase planning order. This is the primary mechanism for keeping the LLM
focused and preventing scope creep. See [planning-and-execution.md](./planning-and-execution.md)
for the full phase definitions.

```
PLANNING PHASES:
  Phase 1 — Foundation: Roles only (create_role, edit_role, delete_role, move_role)
  Phase 2 — Server Layout: Categories + channel structure (create_category, edit_category,
             delete_category, create_channel, edit_channel, delete_channel, move_channel)
  Phase 3 — Access Control: Channel/category overwrites (set_overwrite, remove_overwrite,
             batch_set_overwrite). lock_permissions: true is the default — permissions
             belong on categories, not individual channels.
  Phase 4 — People: Member role assignments (add_role_to_member, remove_role_from_member)

RULES:
- Complete the current phase before starting the next.
- Only plan what the user asked for. Do not expand scope.
- Each phase's system prompt explicitly forbids touching resources from other phases.
- If the user asks for Phase N+1 work without Phases 1..N complete,
  you MAY proceed but MUST note in your summary that earlier phases
  were not verified and issues may arise.
- Use ask_user when the request is ambiguous.
```

### Member Data in LLM Context

The formatter (`apps/server/src/bot/formatter.ts`) provides a role-centric
summary, always included in the system prompt regardless of phase:

```
Member Roles (25 total):
  @Admin (2): alice, bob
  @Moderator (3): charlie, dave, eve
  @Helper (5): frank, grace, heidi, ivan, judy
  @Member (15): 15 members
  @everyone (25): (all members)
```

Formatting rules:

- Roles ordered by position (highest first), then alphabetical
- Max 5 usernames per role; beyond that shows "N members"
- `@everyone` always shown last with "(all members)"
- If all members only have `@everyone`, show: "Member Roles: All 25 members have @everyone only"

This format is compact — a 500-member server with 10 roles stays at ~25-30 lines.
The LLM searches the summary by name when the user mentions a specific member.

### How the LLM Matches Members to Actions

When the user says "give alice the @Mod role":

1. LLM scans the member summary for "alice" → sees her listed under `@Admin`
2. LLM resolves alice's Discord ID from the structured context
3. LLM finds `@Moderator` role in the role list
4. LLM calls `add_role_to_member(user_123456789, mod_role_id)`
5. If "alice" is not found: LLM uses `ask_user` to clarify the member's name

## Configuration Procedure (Recommended Workflow)

A passive sidebar checklist that recommends the 4-phase order. The system does not
block or nag — it offers structure, not enforcement. The user can follow the
procedure, skip phases, or type their own prompts at any time.

### Database

Replace the original `guided_setup_completed` boolean with per-phase progress tracking
on the `guilds` table in `packages/db/src/schema.ts`:

```typescript
phaseProgress: jsonb("phase_progress").default({
  foundation: false,
  layout: false,
  access: false,
  people: false,
}),
```

Also add `guidedSetupCompleted` to the guild PATCH schema in
`apps/server/src/hono/routes/guilds.ts`. The existing Zod schema only accepts
`serverType` and `settings` — add both fields explicitly:

```typescript
const updateGuildSchema = z.object({
  serverType: z.string().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
  guidedSetupCompleted: z.boolean().optional(),
  phaseProgress: z
    .object({
      foundation: z.boolean(),
      layout: z.boolean(),
      access: z.boolean(),
      people: z.boolean(),
    })
    .optional(),
});
```

### Studio Sidebar

Always visible during active configuration. Never disappears — it's reference material,
not a one-time tour.

```
┌─────────────────────────────────┐
│ 📐 Recommended order            │
│                                 │
│ ✅ Foundation    (3 roles)       │
│ ✅ Layout        (2 cat, 6 ch)   │
│ ▶ Access Control [Use prompt →] │
│ ○ People        [Use prompt →]  │
│                                 │
│ ─────────────────────────────── │
│ Or type your own prompt below.  │
└─────────────────────────────────┘
```

Each incomplete phase has a **[Use prompt →]** button. Clicking it starts a **new
conversation** with a predefined scoped prompt (see below). The user can also
click any completed phase to review what was built.

If the user reverts to an earlier phase (e.g., modifies Foundation after Layout
is complete), the sidebar shows a depreciation warning:

```
⚠️ Since "Layout" completed, 1 category was modified.
   2 channels in that category may be affected.
   [Review Layout →]
```

Phase transitions are not blocked. The warning is informational only.

### Per-Phase Prompts

Each phase uses a **predefined, well-tested prompt** crafted by the system, not
the LLM. The prompt is assembled from actual server state and scoped to forbid
touching other phases.

| Phase          | Prompt                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation     | `Define roles only. Set names, colors, base permissions, position. Do NOT create categories, channels, or set overwrites.`                                                                                                     |
| Layout         | `Create categories and channels within the Foundation roles established. Set types, positions, parents, forum tags. Do NOT modify roles or set permission overwrites.`                                                         |
| Access Control | `Set permission overwrites on categories and channels. Default: lock_permissions: true — permissions go on categories. Only un-sync channels that genuinely need different access. Do NOT create or modify channels or roles.` |
| People         | `Assign members to existing roles. Do NOT create roles or modify permissions or channels.`                                                                                                                                     |

Each prompt includes a summary of what was built in previous phases (role list,
channel tree) so the LLM has the full picture without needing conversation history.

### Prompt Preview Card

Before sending, the Studio shows the suggested prompt in an editable card:

```
┌──────────────────────────────────────┐
│ Phase 3 — Access Control             │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Set permission overwrites on     │ │
│ │ categories and channels. Default:│ │
│ │ lock_permissions: true —         │ │
│ │ permissions go on categories...  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [Approve & Send]  [Edit first]       │
└──────────────────────────────────────┘
```

The user can edit the prompt text before sending, or just approve and send.

### Phase Exit

The procedure is passive — no explicit "exit" action needed. If the user types
their own prompt instead of using a suggested one, the sidebar remains but no
longer highlights a current phase. Progress tracking continues (phases that
execute are marked complete) but there is no active enforcement. The sidebar
simply becomes a reference checklist.

## Post-Execution Warnings — "Fix This" Pattern

Once `lockPermissions` is implemented, the validation pipeline can detect
redundant channel overwrites and offer one-click fixes. See
[lockPermissions — Post-Execution "Fix This" Pattern](#post-execution-fix-this-pattern).

### Detection (Validation Group D)

```typescript
// When N channels in the same category have identical overwrites
// AND lockPermissions is false on each:
→ WARNING: "Channels #a, #b, #c in 'Staff' have identical permissions
           but aren't synced to their category."
```

Channel overwrites are compared using a sorted-set comparison (`arraysEqualSorted`)
that handles the same permissions in different order.

### UI Pattern

```
Warning icon next to affected channels in Studio.
Sidebar/warnings tab lists all issues.

Each warning has a [Fix This] button.

[Fix This] → crafted prompt via POST /api/.../revise:
  "Channels #a, #b, #c in 'Staff' have identical permissions.
   Consolidate to category level: set category overwrites, toggle
   lock_permissions: true on each channel."

→ LLM generates consolidation plan
→ User reviews in Studio and approves
→ No new tools or routes — uses existing revise infrastructure
```

### Why This Works

- Detection is deterministic (validation pipeline, no LLM)
- The "Fix This" prompt is craftable entirely in the frontend
- The LLM only acts when the user explicitly clicks — no auto-fix
- Uses existing `revise` endpoint — no new API surface

## File Change Summary

### Member Role Management (implemented)

| #   | File                                                | Change                                                                              |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `packages/shared/src/types.ts`                      | `Member`, `MemberRoleAssignment` types. Extend `DesiredStateActive` + `ServerState` |
| 2   | `packages/shared/src/state/fork.ts`                 | Fork member roles from ServerState into DesiredState                                |
| 3   | `packages/shared/src/state/desired-state-store.ts`  | `addMemberRole()`, `removeMemberRole()` + validation                                |
| 4   | `packages/shared/src/execute-context.ts`            | `addRoleToMember()`, `removeRoleFromMember()` interface                             |
| 5   | `packages/shared/src/tools/members.ts`              | **NEW** — schemas, plan(), execute(), getAssumptions()                              |
| 6   | `packages/shared/src/tools/registry.ts`             | Register 2 new member tools                                                         |
| 7   | `packages/shared/src/tools/index.ts`                | Export member tool exports                                                          |
| 8   | `packages/shared/src/tools/evaluate-assumptions.ts` | `member_exists`, `role_assigned` assumption types                                   |
| 9   | `apps/server/src/bot/execute-context.ts`            | Discord.js `addRoleToMember()`, `removeRoleFromMember()`                            |
| 10  | `apps/server/src/bot/formatter.ts`                  | Role-centric member summary for LLM context                                         |
| 11  | `apps/server/src/planning/diff-engine.ts`           | `generateMemberRoleSteps()`, TOOL_ORDER, wire into diffEngine()                     |
| 12  | `apps/server/src/planning/execution-engine.ts`      | Dispatch cases for add/remove_role_to_member                                        |
| 13  | `apps/server/src/planning/validation.ts`            | Member existence, bot hierarchy, duplicate checks                                   |
| 14  | `apps/server/src/planning/planning-session.ts`      | Phased planning system prompt + member summary injection                            |
| 15  | `apps/server/src/bot/index.ts`                      | Fetch guild members on startup + gateway event updates                              |

### Configuration Procedure (to implement)

| #   | File                                    | Change                                                      |
| --- | --------------------------------------- | ----------------------------------------------------------- |
| 16  | `packages/db/src/schema.ts`             | `phaseProgress` JSONB column on guilds table                |
| 17  | `apps/server/src/hono/routes/guilds.ts` | Add `guidedSetupCompleted`, `phaseProgress` to PATCH schema |
| 18  | `apps/web/src/...`                      | Procedure sidebar component + prompt preview card           |

### lockPermissions (to implement — see next section)

| #   | File                                               | Change                                                                              |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 19  | `packages/shared/src/types.ts`                     | `lockPermissions?: boolean` on `ChannelBase`                                        |
| 20  | `packages/shared/src/tools/channels.ts`            | `lock_permissions` param on create/edit schemas                                     |
| 21  | `packages/shared/src/tools/registry.ts`            | Update `edit_channel` tool description                                              |
| 22  | `packages/shared/src/state/desired-state-store.ts` | Pass lockPermissions through addChannel/editChannel                                 |
| 23  | `apps/server/src/planning/diff-engine.ts`          | Skip overwrite generation for synced channels; include lockPermissions in edit diff |
| 24  | `apps/server/src/bot/execute-context.ts`           | Pass lockPermissions to Discord.js channel methods                                  |
| 25  | `apps/server/src/planning/planning-session.ts`     | Add PERMISSION STRATEGY section to system prompt                                    |
| 26  | `apps/server/src/planning/validation.ts`           | Group D detection of identical overwrites without sync                              |

## lockPermissions — Category-Level Permission Inheritance

### What It Is

Discord's `lockPermissions` property on channels. When `true`, the channel
inherits its parent category's permission overwrites. When `false`, the channel
has its own overwrites.

```
Synced channel (lock_permissions: true):
  Category "Staff":  @everyone deny VIEW, @Staff allow VIEW
  #mod-chat          → inherits all category overwrites (no own overwrites)
  #staff-voice       → inherits all category overwrites
  #staff-logs        → inherits all category overwrites

Un-synced channel (lock_permissions: false):
  #public-feedback   → extra: @everyone allow VIEW    (overrides category deny)
```

### Reading Sync State

Discord.js v14 exposes `channel.permissionsLocked` — a getter returning
`boolean | null`. `true` = synced to parent category, `false` = independent,
`null` = no parent category. No heuristic comparison needed. The `fork()`
function reads it directly:

```typescript
// In fork.ts — for each channel:
lockPermissions: discordChannel.permissionsLocked ?? undefined,
```

The `arraysEqualSorted` helper (see below) is still used for the "Fix This"
post-execution detection, but NOT for reading current state.

### Auto-De-Sync — Discord's Safety Net

When the bot (or any user with MANAGE_CHANNELS + MANAGE_ROLES) modifies
permission overwrites on a synced channel, Discord immediately de-syncs it:

- The channel retains its new, independent overwrites
- Future category permission changes no longer propagate to that channel
- The Discord client shows the channel as "not synced"

This means `lockPermissions: true` is not a hard guarantee — it's a best-effort
default. If the LLM sets `lock_permissions: true` on a channel during Layout
(Phase 2), then in Access Control (Phase 3) sets a per-channel overwrite on it,
Discord silently de-syncs it. Nothing breaks. The "Fix This" detection catches
the mismatch post-execution.

### Why It Matters

**Without lockPermissions:** The LLM sets identical overwrites on every channel
in a category. N channels × M roles = explosion of `set_overwrite` calls.

```
LLM: create_channel("#staff-chat") → set_overwrite(@everyone, deny ALL)
     → set_overwrite(@Staff, allow ALL)
     create_channel("#staff-voice") → same 2 overwrites again
     create_channel("#staff-logs")  → same 2 overwrites again
Result: 6 tool calls for 3 channels
```

**With lockPermissions:** Permissions on the category once, channels synced.
Only channels that genuinely differ get their own overwrites.

```
LLM: create_category("Staff")
     set_overwrite("Staff", @everyone, deny ALL)
     set_overwrite("Staff", @Staff, allow ALL)
     create_channel("#staff-chat", lock_permissions: true)
     create_channel("#staff-voice", lock_permissions: true)
     create_channel("#staff-logs", lock_permissions: true)
     # Exception:
     create_channel("#public-feedback", lock_permissions: false)
     set_overwrite("#public-feedback", @everyone, allow VIEW)
Result: 5 tool calls for 4 channels. Saves tokens, reduces diff steps.
```

### Diff Engine Changes

The diff engine's `generateOverwriteSteps()` must know whether a channel is synced
to skip per-channel overwrite generation. The function signature is extended:

```typescript
// Before:
function generateOverwriteSteps(desired, real): RawStep[];

// After:
function generateOverwriteSteps(desired, real, channels, categoriesByName): RawStep[];
//                                               ↑ new                  ↑ new
```

**Per-channel logic:**

```
For each channel in desired state:
  lockPermissions: true  → skip ALL per-channel overwrite generation.
                           Category overwrites handle access.
  lockPermissions: false → emit set_overwrite/remove_overwrite as normal.

When lockPermissions changes:
  false → true: emit edit_channel with lock_permissions: true.
                No overwrite cleanup needed — Discord handles it.
  true → false: emit edit_channel with lock_permissions: false.
                Emit per-channel overwrites from desired state.
```

### Overwrite Comparison — arraysEqualSorted

Channel overwrite comparison uses sorted-set equality to handle different
ordering of the same permissions:

```typescript
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

Used in the fork heuristic and the "Fix This" detection below. No dependencies,
O(n log n).

### System Prompt — Permission Strategy

The LLM receives this guidance in the Phase 3 (Access Control) system prompt:

```
PERMISSION STRATEGY:
- Default: lock_permissions: true on channels under a category.
  Set overwrites on the CATEGORY, not individual channels.
- Scan channels within each category for identical overwrite patterns.
  When found, propose consolidation: move overwrites to the category
  level and sync the channels.
- If ONE channel needs different permissions than its category:
  lock_permissions: false on that channel, add specific overwrites.
- If MOST channels in a category need different permissions:
  skip category-level overwrites entirely. Set per-channel.
- When uncertain whether a channel should be synced or independent,
  use ask_user to clarify. Do not guess.
- Do NOT set the same overwrites on every channel in a category.
  Put them on the category once.
```

### Channel Creation Default (Phase 2 — Layout)

When the LLM creates channels during Layout, the guidance:

```
Layout — Channel creation:
  RULE: When creating a channel under a category, default to
  lock_permissions: true. The channel will inherit permissions
  from its category in Phase 3 (Access Control).
  Only set false when you already know this channel will need
  different access than its category siblings.
```

### edit_channel Tool Description Update

Add `lock_permissions` to the tool description:

```
Current: "Edit an existing channel. Use this to rename, reparent,
          or change settings."

Future:  "Edit an existing channel. Use this to rename, reparent,
          change settings, or toggle lock_permissions to sync or
          un-sync channel permissions from its parent category."
```

### Post-Execution "Fix This" Pattern

After a plan executes, the validation pipeline detects channels that have
identical overwrites but aren't synced to their category.

**Detection (Validation Group D):**

When N channels in the same category have identical overwrites (compared with
`arraysEqualSorted`) but `lockPermissions: false`, emit a WARNING:

```
"Channels #a, #b, #c in 'Staff' have identical permissions
 but aren't synced to their category."
```

Auto-de-synced channels (where the LLM set `lock_permissions: true` but later
set a conflicting overwrite) are also caught here — their overwrites now differ
from the category but match each other.

**UI Pattern:**

```
Warning icon next to affected channels in Studio.
Sidebar/warnings tab lists all detected issues.

Each warning has a [Fix This] button.

[Fix This] → sends a crafted prompt via POST /api/.../revise:
  "Channels #a, #b, #c in 'Staff' have identical permissions.
   Move overwrites to the category level and set
   lock_permissions: true on each channel."

→ LLM generates consolidation plan
→ User reviews and approves in Studio
→ Uses existing revise infrastructure — no new routes or tools
```

**Why This Pattern Works:**

- Detection is deterministic (validation pipeline, no LLM)
- The "Fix This" prompt is crafted entirely in the frontend
- The LLM only acts when the user explicitly clicks — no automated fixes
- Uses existing `revise` endpoint — no new API surface
- Zero LLM involvement in the warning display or the decision to fix

### Proactive Consolidation During Planning

The LLM can also detect consolidation opportunities during planning, before
execution — using the same scan-for-identical-overwrites heuristic:

```
LLM: "I noticed #staff-chat, #staff-voice, and #staff-logs in the
      Staff category all have identical permissions. Would you like
      me to move those to the category and sync all channels?
      [Yes, consolidate] [No, keep as-is]"
```

Uses existing `ask_user` tool. No new infrastructure needed.

### Relationship to Member Roles

Zero overlap. Member roles (Phase 4) assign roles to members — channel access
is determined by whatever permission model was set in Phase 3, synced or not.
The two features share files but never the same lines.

```
Phase 4: "give alice @Mod role"
  → alice can now see #mod-chat
  → #mod-chat is synced to "Staff" category
  → Category overwrites @Mod with VIEW → alice has access
  → LLM did NOT need to know about lockPermissions
  → Permission implications were fully resolved in Phase 3

Phase 4: "give alice @Mod role"
  → alice can now see #public-feedback
  → #public-feedback is un-synced from "Staff" category
  → Channel overwrite @everyone allows VIEW → alice has access
  → LLM did NOT need to know about lockPermissions
  → Permission implications were fully resolved in Phase 3
```

### Implementation Sequence

```
PR 1: Member Roles (15 files) — DONE
  → Adds Phase 4 to the planning model
  → Adds add/remove_role_from_member tools

PR 2: Configuration Procedure (3 files)
  → Adds phase_progress to guilds table + PATCH schema
  → Adds procedure sidebar component in Studio

PR 3: lockPermissions (8 files)
  → Adds lockPermissions to ChannelBase, fork heuristic, channel schemas
  → Diff engine: skip overwrite generation for synced channels
  → System prompt: PERMISSION STRATEGY section
  → Validation: Group D duplicate overwrite detection + "Fix This"
```
