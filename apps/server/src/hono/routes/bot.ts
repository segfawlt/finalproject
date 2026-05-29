import { Hono } from "hono";
import { botClient } from "../../bot/client";
import { guildCache } from "../../bot/cache";
import type { AppVariables } from "../../types";

const botApp = new Hono<{ Variables: AppVariables }>();

botApp.get("/status", (c) => {
  return c.json({
    isReady: botClient.isReady(),
    guildCount: guildCache.size,
    uptime: botClient.uptime ? Math.floor(botClient.uptime / 1000) : 0,
    loggedInUser: botClient.user?.tag ?? null,
  });
});

export default botApp;
