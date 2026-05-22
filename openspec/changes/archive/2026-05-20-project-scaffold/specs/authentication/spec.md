## ADDED Requirements

### Requirement: Better Auth with Discord OAuth2

The system SHALL use Better Auth as the authentication framework with Discord as the OAuth2 provider. The configuration SHALL include the Discord client ID and client secret via environment variables.

#### Scenario: User initiates Discord OAuth2 login

- **WHEN** user navigates to `/api/auth/signin/discord`
- **THEN** they are redirected to Discord's authorization page

#### Scenario: OAuth2 callback creates user session

- **WHEN** Discord redirects back after authorization
- **THEN** Better Auth creates a session and sets an HTTP-only cookie

#### Scenario: Better Auth tables are created

- **WHEN** the application starts for the first time
- **THEN** the `user`, `session`, `account`, and `verification` tables are created automatically

### Requirement: Session middleware

A Hono middleware SHALL validate the Better Auth session on every protected API request. Valid sessions SHALL attach the user object to the request context. Invalid or missing sessions SHALL return a 401 Unauthorized response.

#### Scenario: Authenticated request succeeds

- **WHEN** a request includes a valid session cookie
- **THEN** the middleware attaches the user to `ctx.user` and the request proceeds

#### Scenario: Unauthenticated request is rejected

- **WHEN** a request has no session cookie or an expired cookie
- **THEN** the middleware returns 401 Unauthorized

### Requirement: Guild-level permission check

The system SHALL verify that a user has the `MANAGE_GUILD` permission in a Discord guild before granting access to that guild's dashboard or studio. This check SHALL be performed via the Discord API using the user's access token.

#### Scenario: User with Manage Server permission can access guild

- **WHEN** a user with `MANAGE_GUILD` permission requests access to a guild's studio
- **THEN** access is granted

#### Scenario: User without Manage Server permission is denied

- **WHEN** a user without `MANAGE_GUILD` permission requests access to a guild's studio
- **THEN** access is denied with a 403 Forbidden response

### Requirement: User roles

The system SHALL support three user roles: `super_admin` (platform owner), `admin` (guild admin), and `user` (regular user). The role SHALL be stored in the `users` table and default to `user`. Role checks SHALL be performed via Hono middleware.

#### Scenario: Default user role is 'user'

- **WHEN** a new user completes OAuth2 login
- **THEN** their role is set to `'user'`

#### Scenario: Super admin has platform-wide access

- **WHEN** a user with `super_admin` role makes any API request
- **THEN** the request is allowed regardless of guild membership

### Requirement: Subscription tier field

The `users` table and `guilds` table SHALL each include a `subscriptionTier` field with values: `free`, `pro`, `enterprise`. The field SHALL default to `free`. Feature flag checks SHALL read this field to determine available features. No payment integration is required for this change.

#### Scenario: New user defaults to free tier

- **WHEN** a new user is created
- **THEN** their `subscriptionTier` is set to `'free'`

#### Scenario: Feature flag reads subscription tier

- **WHEN** a feature flag check is performed
- **THEN** it reads the user's or guild's `subscriptionTier` and returns the appropriate boolean

### Requirement: Auth flow for web app

The web app SHALL provide a "Login with Discord" button that redirects to the Better Auth Discord OAuth2 endpoint. After successful login, the user SHALL be redirected to the Studio or Dashboard. The session cookie SHALL be sent automatically with all subsequent API requests.

#### Scenario: Login button redirects to Discord

- **WHEN** user clicks "Login with Discord" in the web app
- **THEN** they are redirected to the Better Auth Discord OAuth2 endpoint

#### Scenario: Post-login redirect to Studio

- **WHEN** OAuth2 login completes successfully
- **THEN** the user is redirected to `/studio`
