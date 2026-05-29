import { Hono } from "hono";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import { userHasManageGuild } from "../../auth/helpers";
import { checkGuildOperable } from "../../planning/guild-check";
import type { AppVariables } from "../../types";
import type { ServerState } from "@repo/shared";

const stateApp = new Hono<{ Variables: AppVariables }>();

async function checkGuildAccess(c: { get: (key: string) => unknown }, guildId: string) {
  const user = c.get("user") as { id: string } | undefined;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return { allowed: false, status: operable.status, error: operable.error };
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return { allowed: false, status: 403, error: "Forbidden" };
    }
  }

  return { allowed: true };
}

stateApp.get("/state", async (c) => {
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const cache = guildCache.get(guildId);
  const guild = botClient.guilds.cache.get(guildId);

  const state: ServerState = {
    guildId,
    guildName: guild?.name ?? guildId,
    memberCount: guild?.memberCount ?? 0,
    channels: cache ? Array.from(cache.channels.values()) : [],
    roles: cache ? Array.from(cache.roles.values()) : [],
    overwrites: cache ? Array.from(cache.permissions.values()) : [],
  };

  return c.json(state);
});

stateApp.get("/channels", async (c) => {
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const cache = guildCache.get(guildId);
  const channels = cache ? Array.from(cache.channels.values()) : [];

  return c.json(channels);
});

stateApp.get("/roles", async (c) => {
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 404 | 403);
  }

  const cache = guildCache.get(guildId);
  const roles = cache ? Array.from(cache.roles.values()) : [];

  return c.json(roles);
});

export default stateApp;
