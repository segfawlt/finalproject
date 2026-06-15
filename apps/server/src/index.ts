import { serve } from "@hono/node-server";
import app from "./hono/app";
import { botClient } from "./bot/client";
import { setupBotEvents } from "./bot";
import { clearStaleLocks } from "./planning/locking";
import { startSnapshotCleanupJob } from "./planning/snapshot-cleanup";
import { startPeriodicLockCleanup } from "./planning/locking";
import { startDriftDetector } from "./planning/drift-detector";
import { driftEvents } from "@repo/db";
import { db } from "@repo/db";
import { guildCache } from "./bot/cache";
import { logger } from "./utils/logger";
import { runMigrations } from "./migrate";
import { getValidatedEnv } from "./env-validated";

const env = getValidatedEnv();

// Start Hono server
serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  async (info) => {
    logger.info(`Hono API listening on http://localhost:${info.port}`);

    // Run pending migrations before serving real traffic so a fresh deploy
    // never lands in a half-migrated state.
    try {
      await runMigrations();
    } catch (err) {
      logger.error(err, "Failed to run migrations");
      process.exit(1);
    }

    // Clear any stale guild locks left by a previous crash
    try {
      await clearStaleLocks();
    } catch (err) {
      logger.error(err, "Failed to clear stale guild locks");
    }
  }
);

// Start background jobs
startSnapshotCleanupJob();
startPeriodicLockCleanup();

const stopDriftDetector = startDriftDetector(
  botClient,
  (guildId) => {
    const cache = guildCache.get(guildId);
    if (!cache) return null;
    return {
      channels: Array.from(cache.channels.values()).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        position: c.position,
      })),
      roles: Array.from(cache.roles.values()).map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
      })),
    };
  },
  {
    intervalMs: 60_000,
    onEvents: async (events) => {
      try {
        await db.insert(driftEvents).values(
          events.map((e) => ({
            guildId: e.guildId,
            severity: e.severity,
            kind: e.kind,
            summary: e.summary,
            details: e.details,
          }))
        );
      } catch (err) {
        logger.error(err, "Failed to persist drift events");
      }
    },
  }
);

process.on("SIGTERM", () => {
  stopDriftDetector();
});
process.on("SIGINT", () => {
  stopDriftDetector();
});

// Start Discord bot
async function startBot() {
  const token = env.DISCORD_BOT_TOKEN;
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN not set — bot will not connect to Discord");
    return;
  }

  setupBotEvents();

  try {
    await botClient.login(token);
  } catch (error) {
    logger.error(error, "Failed to login to Discord");
  }
}

startBot();
