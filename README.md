# Discord Platform — Agentic Orchestration & Declarative State Engine

AI-driven Discord server management platform. Configure complex server environments using natural language, with real-time dry-run previews and safety-first validation.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`npm install -g pnpm`)
- Docker & Docker Compose (for local PostgreSQL)
- Discord Application (for OAuth2 + Bot)

### Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd discord-platform
pnpm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your Discord credentials and database URL

# 3. Start PostgreSQL
docker compose up -d

# 4. Run database migrations
pnpm db:migrate

# 5. Start development servers
pnpm dev
```

The web app will be available at `http://localhost:5173` and the API at `http://localhost:3001`.

## Project Structure

```
├── apps/
│   ├── web/          # Vite + React SPA (Studio + Dashboard)
│   ├── server/       # Hono API + Discord.js Bot (monolith)
│   └── docs/         # Astro (Landing page + Documentation)
├── packages/
│   ├── shared/       # Tool registry, types, validation utilities
│   └── db/           # Drizzle ORM schema, migrations
├── docker-compose.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Scripts

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Start web app + server concurrently            |
| `pnpm lint`        | Run ESLint across all packages                 |
| `pnpm format`      | Format code with Prettier                      |
| `pnpm db:generate` | Generate Drizzle migration from schema changes |
| `pnpm db:migrate`  | Apply pending migrations to database           |
| `pnpm db:studio`   | Open Drizzle Studio (database GUI)             |

## Tech Stack

- **Frontend:** Vite + React, React Router v6, Zustand, Tailwind CSS
- **Backend:** Hono, Discord.js v14, Better Auth
- **Database:** PostgreSQL, Drizzle ORM
- **AI:** Vercel AI SDK + OpenRouter
- **Real-time:** SSE (Server-Sent Events)

## Environment Variables

| Variable                | Description                          |
| ----------------------- | ------------------------------------ |
| `DATABASE_URL`          | PostgreSQL connection string         |
| `DISCORD_CLIENT_ID`     | Discord OAuth2 client ID             |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 client secret         |
| `DISCORD_BOT_TOKEN`     | Discord bot token                    |
| `BETTER_AUTH_SECRET`    | Random string for session encryption |
| `BETTER_AUTH_URL`       | Base URL for auth callbacks          |
| `PORT`                  | Server port (default: 3001)          |

## Development

- **Web app:** `pnpm --filter @repo/web dev` (port 5173)
- **Server:** `pnpm --filter @repo/server dev` (port 3001)
- **Database GUI:** `pnpm db:studio`
