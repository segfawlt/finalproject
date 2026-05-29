import { serve } from "@hono/node-server";
import app from "./hono/app";
import { botClient } from "./bot/client";
import { setupBotEvents } from "./bot";
import { clearStaleLocks } from "./planning/locking";
import { startSnapshotCleanupJob } from "./planning/snapshot-cleanup";
import { startPeriodicLockCleanup } from "./planning/locking";
import { logger } from "./utils/logger";

const PORT = parseInt(process.env.PORT || "3001", 10);

// Start Hono server
serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  async (info) => {
    logger.info(`Hono API listening on http://localhost:${info.port}`);

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

// Start Discord bot
async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
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
