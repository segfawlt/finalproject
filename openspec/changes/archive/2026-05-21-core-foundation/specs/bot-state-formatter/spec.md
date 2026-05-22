## ADDED Requirements

### Requirement: Structured text format output

The bot state formatter SHALL convert the in-memory guild cache into a structured text representation matching the format specified in ProjectDescription.md Section 2.D. The output SHALL include the server name, member count, categories with nested channels, and roles with member counts and permissions.

#### Scenario: Formatter outputs server header

- **WHEN** `formatGuildForLLM("guildId")` is called for a guild named "My Gaming Server" with 150 members
- **THEN** the output begins with `Server: My Gaming Server (150 members)`

#### Scenario: Formatter outputs channel hierarchy

- **WHEN** the cache has a category "General" containing a channel "chat"
- **THEN** the output includes `General` as a top-level heading with `#chat` indented beneath it

#### Scenario: Channels without parent appear at root level

- **WHEN** the cache has a channel "welcome" with no parent_id
- **THEN** `#welcome` appears at the root level, not indented under any category

### Requirement: Channel activity information

The formatter SHALL include message count for text channels and channel type label for all channels. Channel type SHALL be displayed using labels (text, voice, announcement, stage, forum).

#### Scenario: Text channel shows message count and type

- **WHEN** a text channel "chat" has 5200 messages in the cache
- **THEN** the output shows `#chat — text, 5200 msgs`

#### Scenario: Voice channel omits message count

- **WHEN** a voice channel "voice" has type voice
- **THEN** the output shows `#voice — voice` without a message count

### Requirement: Permission overwrite notation

The formatter SHALL display permission overwrites using `+` for allow, `-` for deny, separated by commas. Permissions not listed SHALL be omitted (neutral/inherited). The role name SHALL prefix each override.

#### Scenario: Allow overwrite displays with +

- **WHEN** a channel has @everyone allowed VIEW_CHANNEL
- **THEN** the output includes `@everyone: +view`

#### Scenario: Deny overwrite displays with -

- **WHEN** a channel has @everyone denied VIEW_CHANNEL
- **THEN** the output includes `@everyone: -view`

#### Scenario: Multiple overwrites separated by pipe

- **WHEN** a channel has two role overwrites (@everyone and @team-alpha)
- **THEN** the output includes both overrides separated by `|`

### Requirement: Role representation

The formatter SHALL display roles with member count, position, and a space-separated list of permission names. The @everyone role SHALL always be listed last.

#### Scenario: Role shows permissions as names

- **WHEN** a role "Moderator" has MANAGE_CHANNELS and MANAGE_ROLES permissions
- **THEN** the output shows `Moderator — 2 members, pos:10, MANAGE_CHANNELS, MANAGE_ROLES`

#### Scenario: @everyone role listed last

- **WHEN** the cache has roles "Organizer" (pos:10), "Player" (pos:1), "@everyone" (pos:0)
- **THEN** the roles section lists Organizer first, then Player, then @everyone last

### Requirement: Channel classification labels

The formatter SHALL include importance classification labels (IMPORTANT, MODERATE, LOW) if classification data is available in the cache. Labels SHALL appear above each channel line.

#### Scenario: IMPORTANT classification shown

- **WHEN** a channel "announcements" is classified as IMPORTANT
- **THEN** the output includes `[IMPORTANT]` prefix before `#announcements`

#### Scenario: No classification label when data unavailable

- **WHEN** classification data is not present in the cache
- **THEN** no `[...]` prefix appears on any channel

### Requirement: Empty guild handling

The formatter SHALL gracefully handle empty guilds with no channels or roles.

#### Scenario: Empty guild returns minimal output

- **WHEN** `formatGuildForLLM()` is called for a guild with no channels and no roles
- **THEN** the output includes the server header and empty sections "(none)" for Categories and Roles
