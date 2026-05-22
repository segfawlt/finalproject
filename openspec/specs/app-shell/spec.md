

### Requirement: Hono API application

The server SHALL run a Hono application that serves as the HTTP API for the web app. The app SHALL be configured with CORS middleware to allow requests from the web app's development URL. The app SHALL export its routes and middleware for testing.

#### Scenario: Hono app starts and listens

- **WHEN** the server process starts
- **THEN** Hono listens on the configured port (default 3001)

#### Scenario: CORS allows web app requests

- **WHEN** the web app makes a request to the API during development
- **THEN** the response includes appropriate CORS headers

### Requirement: Health check endpoint

The API SHALL expose a `GET /api/health` endpoint that returns a 200 status with a JSON body containing the server status, timestamp, and database connection status.

#### Scenario: Health check returns OK

- **WHEN** `GET /api/health` is called and the server is running
- **THEN** the response is 200 with `{ status: "ok", timestamp: "...", database: "connected" }`

#### Scenario: Health check reports database failure

- **WHEN** `GET /api/health` is called and the database is unreachable
- **THEN** the response is 200 with `{ status: "ok", timestamp: "...", database: "disconnected" }`

### Requirement: SSE streaming endpoint

The API SHALL expose a `GET /api/plan/:id/stream` endpoint that streams Server-Sent Events to the client. The endpoint SHALL use Hono's `streaming` module. For this change, the endpoint SHALL stream a placeholder event (implementation of real plan streaming is deferred).

#### Scenario: SSE connection is established

- **WHEN** a client opens `GET /api/plan/:id/stream`
- **THEN** the connection is established with `Content-Type: text/event-stream`

#### Scenario: SSE sends placeholder event

- **WHEN** the SSE connection is active
- **THEN** a placeholder event is sent to the client (e.g., `{ event: "status", data: "streaming_ready" }`)

### Requirement: Discord.js bot client

The server SHALL instantiate a Discord.js v14 `Client` with configured intents (Guilds, GuildMessages, GuildMembers). The client SHALL connect to the Discord Gateway on server startup and maintain a persistent WebSocket connection.

#### Scenario: Bot connects to Discord Gateway

- **WHEN** the server process starts with a valid bot token
- **THEN** the Discord.js client emits a `ready` event

#### Scenario: Bot reconnects on disconnect

- **WHEN** the Gateway connection is lost
- **THEN** Discord.js automatically attempts to reconnect

### Requirement: Bot in-memory cache structure

The bot SHALL maintain an in-memory cache of guild state (channels, roles, permissions) structured as typed Maps. The cache SHALL be updated in real-time via Discord Gateway events. The cache SHALL be accessible as an import from the Hono API routes (same process).

#### Scenario: Cache is initialized on bot ready

- **WHEN** the bot emits a `ready` event
- **THEN** the cache structure is initialized with empty Maps for channels, roles, and permissions

#### Scenario: Cache is accessible from API routes

- **WHEN** an API route imports the bot cache
- **THEN** it can read from the cache Maps without HTTP calls

### Requirement: Vite + React web application

The web app SHALL be a Vite + React SPA with React Router v6 for client-side routing. The app SHALL use Tailwind CSS for styling with a Discord-like dark theme. The app SHALL use Zustand for global state management.

#### Scenario: Web app starts in development mode

- **WHEN** `pnpm dev` is run for the web app
- **THEN** Vite serves the app on the configured port (default 5173) with hot module replacement

#### Scenario: Tailwind Discord theme is applied

- **WHEN** the web app renders
- **THEN** the background uses Discord's dark color (#313338) and text uses Discord's text color (#dcddde)

### Requirement: Web app route structure

The web app SHALL define the following routes:

- `/` → Redirect to `/studio` or login page
- `/studio` → Studio landing (guild selector or redirect)
- `/studio/:guildId` → Studio for specific guild
- `/dashboard` → Dashboard landing
- `/dashboard/:guildId` → Dashboard for specific guild
- `/setup` → First-time setup wizard landing
- `/setup/:guildId` → Setup wizard for specific guild

Each route SHALL render a placeholder component with the route name (full implementation deferred).

#### Scenario: Route navigation works

- **WHEN** user navigates to `/studio/123456`
- **THEN** the Studio placeholder component for guild `123456` is rendered

#### Scenario: Root path redirects

- **WHEN** user navigates to `/`
- **THEN** they are redirected to `/studio` or the login page based on auth state

### Requirement: Zustand stores

The web app SHALL define the following Zustand stores:

- `useAuthStore` — current user, login state, login/logout actions
- `useStudioStore` — selected guild, UI panel state, drag/drop state, multi-select state
- `useDashboardStore` — dashboard UI state

Each store SHALL be typed with TypeScript interfaces and initialized with default empty/null state.

#### Scenario: Auth store tracks login state

- **WHEN** `useAuthStore` is initialized
- **THEN** `user` is null and `isAuthenticated` is false

#### Scenario: Studio store tracks selected guild

- **WHEN** `useStudioStore.setSelectedGuild("123456")` is called
- **THEN** `selectedGuild` is set to `"123456"`

### Requirement: Concurrent development server

The project root SHALL provide a `pnpm dev` command that starts both the web app and the server concurrently. Output from both processes SHALL be prefixed with their package name for readability.

#### Scenario: Single command starts all apps

- **WHEN** `pnpm dev` is run from the project root
- **THEN** both the web app (port 5173) and server (port 3001) start and are accessible
