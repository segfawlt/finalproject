import { serve } from "@hono/node-server";
import app from "./hono/app";
import { botClient } from "./bot/client";
import { setupBotEvents } from "./bot";

const PORT = parseInt(process.env.PORT || "3001", 10);

// Start Hono server
serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`Hono API listening on http://localhost:${info.port}`);
  }
);

// Start Discord bot
async function startBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("DISCORD_BOT_TOKEN not set — bot will not connect to Discord");
    return;
  }

  setupBotEvents();

  try {
    await botClient.login(token);
  } catch (error) {
    console.error("Failed to login to Discord:", error);
  }
}

startBot();
