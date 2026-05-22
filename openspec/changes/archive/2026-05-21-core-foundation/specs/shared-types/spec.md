## ADDED Requirements

### Requirement: Discord resource types

The `packages/shared` package SHALL export TypeScript interfaces for Discord resources, including `ChannelType`, `ChannelBase`, `CategoryNode`, `TextChannel`, `VoiceChannel`, `Role`, and `PermissionOverwrite`. These interfaces SHALL be framework-agnostic (no dependency on Drizzle or Discord.js types).

#### Scenario: Channel interface includes required fields

- **WHEN** the `ChannelBase` interface is inspected
- **THEN** it includes `id` (string), `name` (string), `type` (number), `parentId` (string | null), and `position` (number)

#### Scenario: Role interface includes permission bitfield

- **WHEN** the `Role` interface is inspected
- **THEN** it includes `id`, `name`, `position` (number), `permissions` (string bitfield), and `color` (number)

#### Scenario: PermissionOverwrite links role to channel

- **WHEN** the `PermissionOverwrite` interface is inspected
- **THEN** it includes `channelId`, `roleId`, `allow` (string bitfield), and `deny` (string bitfield)

### Requirement: Plan and execution types

The `packages/shared` package SHALL export TypeScript interfaces for `PlanStatus`, `Plan`, `PlanStep`, `SymbolEntry`, `SymbolTable`, `Assumption`, `AssumptionStatus`, `Iteration`, and `IterationType`.

#### Scenario: Plan interface includes required fields

- **WHEN** the `Plan` interface is inspected
- **THEN** it includes `id`, `guildId`, `userId`, `status` (PlanStatus), `userPrompt`, `planData`, `createdAt`, `updatedAt`, and optional `executedAt`, `completedAt`, `error`

#### Scenario: PlanStep includes status tracking

- **WHEN** the `PlanStep` interface is inspected
- **THEN** it includes `index` (number), `toolName` (string), `params` (record), `status` (step status), and optional `resolvedParams`, `result`, `error`

#### Scenario: SymbolTable maps symbols to entries

- **WHEN** the `SymbolTable` type is inspected
- **THEN** it is a `Record<string, SymbolEntry>` where each `SymbolEntry` includes `symbol`, `type`, `definingStepIndex`, and optional `resolvedDiscordId`

#### Scenario: Assumption includes check fields

- **WHEN** the `Assumption` interface is inspected
- **THEN** it includes `type`, `value`, `resourceType`, `checked` (boolean), and `status` (AssumptionStatus)

#### Scenario: Iteration tracks versioned state

- **WHEN** the `Iteration` interface is inspected
- **THEN** it includes `version`, `type` (IterationType), `desiredState`, and `timestamp`

### Requirement: Server state type

The `packages/shared` package SHALL export a `ServerState` interface representing a full guild with categories, channels, roles, and overwrites.

#### Scenario: ServerState includes all resource collections

- **WHEN** the `ServerState` interface is inspected
- **THEN** it includes `guildId` (string), `guildName` (string), `channels` (ChannelBase[]), `roles` (Role[]), and `overwrites` (PermissionOverwrite[])

### Requirement: Discord permission constants

The `packages/shared` package SHALL export a `DISCORD_PERMISSIONS` constant mapping Discord permission names to their bitfield values and descriptions. The constant SHALL include all permissions available in `discord.js` `PermissionFlagsBits`.

#### Scenario: Permission constant includes VIEW_CHANNEL

- **WHEN** `DISCORD_PERMISSIONS` is accessed
- **THEN** it contains an entry for `VIEW_CHANNEL` with its bigint bitfield value and a description string

#### Scenario: Permission constant is immutable

- **WHEN** code attempts to modify `DISCORD_PERMISSIONS`
- **THEN** TypeScript reports a compile error due to `as const` assertion

### Requirement: Channel type constants

The `packages/shared` package SHALL export a `CHANNEL_TYPES` constant mapping Discord channel type integers to their string labels.

#### Scenario: Channel type constants include TEXT and VOICE

- **WHEN** `CHANNEL_TYPES` is accessed
- **THEN** it maps `0` to `"text"` and `2` to `"voice"`
