import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, guilds } from "@repo/db";
import { eq } from "drizzle-orm";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import { userHasManageGuild } from "../../auth/helpers";
import { checkGuildOperable } from "../../planning/guild-check";
import type { AppVariables } from "../../types";

const guildsApp = new Hono<{ Variables: AppVariables }>();

const updateGuildSchema = z.object({
  serverType: z.string().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
  phaseProgress: z
    .object({
      foundation: z.boolean(),
      layout: z.boolean(),
      access: z.boolean(),
      people: z.boolean(),
    })
    .optional(),
});

guildsApp.get("/", async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const result: Array<{
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
  }> = [];

  if (!user || !botClient.isReady()) {
    return c.json(result);
  }

  for (const [guildId] of guildCache) {
    const operable = checkGuildOperable(guildId);
    if (!operable.ok) continue;

    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) continue;

    const guild = botClient.guilds.cache.get(guildId);
    result.push({
      id: guildId,
      name: guild?.name ?? guildId,
      icon: guild?.iconURL() ?? null,
      memberCount: guild?.memberCount ?? 0,
    });
  }

  return c.json(result);
});

guildsApp.get("/:guildId", async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const [row] = await db.select().from(guilds).where(eq(guilds.id, guildId));

  if (row) {
    return c.json(row);
  }

  const guild = botClient.guilds.cache.get(guildId);
  return c.json({
    id: guildId,
    name: guild?.name ?? guildId,
    icon: guild?.iconURL() ?? null,
    serverType: null,
    settings: {},
    subscriptionTier: "free",
    createdAt: null,
    updatedAt: null,
  });
});

guildsApp.patch("/:guildId", zValidator("json", updateGuildSchema), async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  if (user) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  const guild = botClient.guilds.cache.get(guildId);
  const data: Record<string, unknown> = {
    id: guildId,
    name: guild?.name ?? guildId,
  };
  if (body.serverType !== undefined) data.serverType = body.serverType;
  if (body.settings !== undefined) data.settings = body.settings;
  if (body.phaseProgress !== undefined) data.phaseProgress = body.phaseProgress;

  const [existing] = await db.select().from(guilds).where(eq(guilds.id, guildId));

  if (!existing) {
    await db.insert(guilds).values(data as typeof guilds.$inferInsert);
  } else {
    await db.update(guilds).set(data).where(eq(guilds.id, guildId));
  }

  const [updated] = await db.select().from(guilds).where(eq(guilds.id, guildId));

  return c.json(updated);
});

export default guildsApp;
