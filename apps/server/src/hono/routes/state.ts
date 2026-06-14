import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import { userHasManageGuild } from "../../auth/helpers";
import { requireUser } from "../../auth/middleware";
import { checkGuildOperable } from "../../planning/guild-check";
import { subscribeToGuildDrift, type DriftEvent } from "../../planning/drift-detector";
import type { AppVariables } from "../../types";
import type { ServerState } from "@repo/shared";

const stateApp = new Hono<{ Variables: AppVariables }>();

async function checkGuildAccess(c: { get: (key: string) => unknown }, guildId: string) {
  const user = c.get("user") as { id: string } | undefined;
  if (!user) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return { allowed: false, status: operable.status, error: operable.error };
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return { allowed: false, status: 403, error: "Forbidden" };
  }

  return { allowed: true };
}

stateApp.get("/state", async (c) => {
  requireUser(c);
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
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
  requireUser(c);
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
  }

  const cache = guildCache.get(guildId);
  const channels = cache ? Array.from(cache.channels.values()) : [];

  return c.json(channels);
});

stateApp.get("/roles", async (c) => {
  requireUser(c);
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
  }

  const cache = guildCache.get(guildId);
  const roles = cache ? Array.from(cache.roles.values()) : [];

  return c.json(roles);
});

stateApp.get("/drift/stream", async (c) => {
  requireUser(c);
  const guildId = c.req.param("guildId")!;
  const access = await checkGuildAccess(c, guildId);
  if (!access.allowed) {
    return c.json({ error: access.error }, access.status as 401 | 404 | 403);
  }

  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribeToGuildDrift(guildId, (event: DriftEvent) => {
      stream
        .writeSSE({
          event: "drift",
          data: JSON.stringify(event),
        })
        .catch(() => {
          unsubscribe();
        });
    });

    stream.onAbort(() => {
      unsubscribe();
    });

    await stream.writeSSE({
      event: "ready",
      data: JSON.stringify({ guildId }),
    });

    while (!stream.aborted) {
      await stream.sleep(15_000);
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ ts: Date.now() }),
      });
    }

    unsubscribe();
  });
});

export default stateApp;
