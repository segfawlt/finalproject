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

// Discord bot OAuth invite URL. Uses ADMINISTRATOR scope for simplicity — the
// platform needs to create/manage channels, roles, and members, so the
// full-permissions invite is the easiest path for first-time setup.
botApp.get("/invite", (c) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return c.json({ error: "DISCORD_CLIENT_ID not configured" }, 500);
  }
  const permissions = 8n; // ADMINISTRATOR
  const url =
    `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}` +
    `&scope=bot%20applications.commands&permissions=${permissions.toString()}`;
  return c.json({ url, permissions: permissions.toString() });
});

export default botApp;
