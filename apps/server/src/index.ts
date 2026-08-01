import { serve } from "@hono/node-server";
import { db, driftEvents } from "@repo/db";
import { setupBotEvents } from "./bot";
import { botClient } from "./bot/client";
import { guildCache } from "./bot/cache";
import { getValidatedEnv } from "./env-validated";
import app from "./hono/app";
import { runMigrations } from "./migrate";
import { startDriftDetector } from "./planning/drift-detector";
import { clearStaleLocks, startPeriodicLockCleanup } from "./planning/locking";
import { recoverInterruptedPlanningSessions } from "./planning/session-recovery";
import { startSnapshotCleanupJob } from "./planning/snapshot-cleanup";
import { logger } from "./utils/logger";

const env = getValidatedEnv();

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

async function main(): Promise<void> {
  // Establish the schema and repair persisted process-local state before any
  // listener, bot handler, or background job can touch the database.
  await runMigrations();
  await clearStaleLocks();
  await recoverInterruptedPlanningSessions();

  const stopSnapshotCleanup = startSnapshotCleanupJob();
  const stopLockCleanup = startPeriodicLockCleanup();
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
            events.map((event) => ({
              guildId: event.guildId,
              severity: event.severity,
              kind: event.kind,
              summary: event.summary,
              details: event.details,
            }))
          );
        } catch (err) {
          logger.error(err, "Failed to persist drift events");
        }
      },
    }
  );

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
    },
    (info) => {
      logger.info(`Hono API listening on http://localhost:${info.port}`);
    }
  );

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopSnapshotCleanup();
    stopLockCleanup();
    stopDriftDetector();
    server.close();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  void startBot();
}

main().catch((err) => {
  logger.error(err, "Failed to start server");
  process.exitCode = 1;
});
