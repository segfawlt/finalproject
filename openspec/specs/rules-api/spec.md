### Requirement: Create rule endpoint

The system SHALL expose a `POST /api/guilds/:guildId/rules` endpoint that creates a new server rule for the specified guild. The request body SHALL contain `ruleText` (string, required, 1-4000 chars). The endpoint SHALL require authentication and guild admin permission.

#### Scenario: Admin creates a rule

- **WHEN** an authenticated user with guild admin permission sends `POST /api/guilds/123/rules` with `{ "ruleText": "No @everyone mentions" }`
- **THEN** the response is 201 with the created rule object including `id`, `guildId`, `ruleText`, `createdAt`, `updatedAt`

#### Scenario: Missing ruleText returns 400

- **WHEN** the request body is `{}`
- **THEN** the response is 400 with a validation error message

#### Scenario: Unauthenticated request returns 401

- **WHEN** a request has no session cookie
- **THEN** the response is 401 Unauthorized

### Requirement: List rules endpoint

The system SHALL expose a `GET /api/guilds/:guildId/rules` endpoint that returns all rules for the specified guild, ordered by creation date (oldest first).

#### Scenario: List returns all rules for guild

- **WHEN** guild `123` has 3 rules and `GET /api/guilds/123/rules` is called
- **THEN** the response is 200 with an array of 3 rule objects

#### Scenario: Empty list when guild has no rules

- **WHEN** guild `123` has no rules
- **THEN** the response is 200 with an empty array `[]`

### Requirement: Update rule endpoint

The system SHALL expose a `PUT /api/guilds/:guildId/rules/:ruleId` endpoint that updates the `ruleText` of an existing rule. Only the `ruleText` field shall be updatable. The endpoint SHALL validate that the rule belongs to the specified guild.

#### Scenario: Admin updates a rule

- **WHEN** `PUT /api/guilds/123/rules/rule-uuid` is called with `{ "ruleText": "Updated rule" }`
- **THEN** the response is 200 with the updated rule object and `updatedAt` reflecting the change

#### Scenario: Updating non-existent rule returns 404

- **WHEN** the `ruleId` does not exist in the database
- **THEN** the response is 404 Not Found

#### Scenario: Updating rule from different guild returns 404

- **WHEN** the rule exists but belongs to a different guild than the URL parameter
- **THEN** the response is 404 Not Found

### Requirement: Delete rule endpoint

The system SHALL expose a `DELETE /api/guilds/:guildId/rules/:ruleId` endpoint that permanently deletes a server rule.

#### Scenario: Admin deletes a rule

- **WHEN** `DELETE /api/guilds/123/rules/rule-uuid` is called for an existing rule
- **THEN** the response is 200 with `{ "deleted": true }` and the rule is removed from the database

#### Scenario: Deleting non-existent rule returns 404

- **WHEN** the `ruleId` does not exist
- **THEN** the response is 404 Not Found

### Requirement: Guild permission check for rules

All rules endpoints SHALL verify that the authenticated user has the `MANAGE_GUILD` permission in the target Discord guild before processing the request.

#### Scenario: User without MANAGE_GUILD returns 403

- **WHEN** a user without `MANAGE_GUILD` permission in guild `123` calls any rules endpoint
- **THEN** the response is 403 Forbidden
