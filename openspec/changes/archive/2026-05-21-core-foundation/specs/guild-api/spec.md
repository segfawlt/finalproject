## ADDED Requirements

### Requirement: List guilds endpoint

The system SHALL expose a `GET /api/guilds` endpoint that returns the list of Discord guilds the authenticated user can access. The endpoint SHALL read guild data from the bot's in-memory cache and filter to guilds where the user has `MANAGE_GUILD` permission. Each guild object SHALL include `id`, `name`, `icon` (nullable), and `memberCount`.

#### Scenario: User lists accessible guilds

- **WHEN** an authenticated user calls `GET /api/guilds` and the bot is in 5 guilds, 3 of which the user has MANAGE_GUILD in
- **THEN** the response is 200 with an array of 3 guild objects

#### Scenario: Bot has no guilds in cache

- **WHEN** the bot is not in any guilds
- **THEN** the response is 200 with an empty array `[]`

#### Scenario: Unauthenticated request returns 401

- **WHEN** a request has no session cookie
- **THEN** the response is 401 Unauthorized

### Requirement: Get guild settings endpoint

The system SHALL expose a `GET /api/guilds/:guildId` endpoint that returns the guild's stored settings. The response SHALL include `id`, `name`, `icon`, `serverType`, `settings` (JSONB object), `subscriptionTier`, `createdAt`, and `updatedAt`. If the guild is not yet registered in the database, the system SHALL return the guild info from the bot cache with default settings.

#### Scenario: Guild exists in database

- **WHEN** `GET /api/guilds/123` is called and guild `123` has stored settings with `serverType: "gaming"`
- **THEN** the response is 200 with `serverType: "gaming"` and the full settings object

#### Scenario: Guild not registered in database

- **WHEN** `GET /api/guilds/123` is called but guild `123` has no row in the guilds table (though the bot is in it)
- **THEN** the response is 200 with default values (`serverType: null`, `settings: {}`)

#### Scenario: Guild does not exist in bot cache

- **WHEN** `GET /api/guilds/999` is called and the bot is not in guild `999`
- **THEN** the response is 404 Not Found

### Requirement: Update guild settings endpoint

The system SHALL expose a `PATCH /api/guilds/:guildId` endpoint that updates the guild's `serverType` and `settings` fields. The request body SHALL accept `serverType` (string, nullable) and `settings` (object). If the guild does not yet have a database row, it SHALL be created (upsert).

#### Scenario: Admin updates server type

- **WHEN** `PATCH /api/guilds/123` is called with `{ "serverType": "gaming" }`
- **THEN** the response is 200 with the updated guild object and `serverType: "gaming"`

#### Scenario: Admin updates settings object

- **WHEN** `PATCH /api/guilds/123` is called with `{ "settings": { "welcome_message": "Hello" } }`
- **THEN** the response is 200 with `settings: { "welcome_message": "Hello" }`

#### Scenario: Guild upserted on first settings update

- **WHEN** `PATCH /api/guilds/456` is called for a guild not yet in the database
- **THEN** a new row is inserted into the guilds table and the response is 200

### Requirement: Guild permission check

All guild endpoints SHALL verify that the authenticated user has the `MANAGE_GUILD` permission in the target Discord guild. The check SHALL use Discord API via the user's stored access token.

#### Scenario: User without MANAGE_GUILD returns 403

- **WHEN** a user without `MANAGE_GUILD` permission in guild `123` calls any guild endpoint for that guild
- **THEN** the response is 403 Forbidden
