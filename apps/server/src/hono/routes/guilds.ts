import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, guilds, conversations } from "@repo/db";
import { desc, eq, inArray } from "drizzle-orm";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import { userHasManageGuild } from "../../auth/helpers";
import { requireUser } from "../../auth/middleware";
import { checkGuildOperable } from "../../planning/guild-check";
import type { AppVariables } from "../../types";

const guildsApp = new Hono<{ Variables: AppVariables }>();

const updateGuildSchema = z.object({
  serverType: z.string().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
});

guildsApp.get("/", async (c) => {
  const user = requireUser(c);
  const result: Array<{
    id: string;
    name: string;
    icon: string | null;
    memberCount: number;
    latestConversation: { prompt: string; updatedAt: Date } | null;
  }> = [];

  if (!botClient.isReady()) {
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
      latestConversation: null,
    });
  }

  if (result.length > 0) {
    const latest = await db
      .select({
        guildId: conversations.guildId,
        userPrompt: conversations.userPrompt,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(
        inArray(
          conversations.guildId,
          result.map((guild) => guild.id)
        )
      )
      .orderBy(desc(conversations.updatedAt));
    const seen = new Set<string>();
    for (const conversation of latest) {
      if (seen.has(conversation.guildId)) continue;
      seen.add(conversation.guildId);
      const guild = result.find((item) => item.id === conversation.guildId);
      if (guild) {
        guild.latestConversation = {
          prompt: conversation.userPrompt,
          updatedAt: conversation.updatedAt,
        };
      }
    }
  }

  return c.json(result);
});

guildsApp.get("/:guildId", async (c) => {
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
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
  const user = requireUser(c);
  const guildId = c.req.param("guildId")!;
  const body = c.req.valid("json");

  const operable = checkGuildOperable(guildId);
  if (!operable.ok) {
    return c.json({ error: operable.error }, operable.status);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const guild = botClient.guilds.cache.get(guildId);
  const data: Record<string, unknown> = {
    id: guildId,
    name: guild?.name ?? guildId,
  };
  if (body.serverType !== undefined) data.serverType = body.serverType;
  if (body.settings !== undefined) data.settings = body.settings;

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
