import { Hono } from "hono";
import type { Context, Next } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, rules } from "@repo/db";
import { eq, and } from "drizzle-orm";
import { userHasManageGuild } from "../../auth/helpers";
import type { AppVariables } from "../../types";

const rulesApp = new Hono<{ Variables: AppVariables }>();

const createRuleSchema = z.object({
  ruleText: z.string().min(1).max(4000),
});

const updateRuleSchema = z.object({
  ruleText: z.string().min(1).max(4000),
});

async function requireGuildAdmin(c: Context<{ Variables: AppVariables }>, next: Next) {
  const user = c.get("user");
  const guildId = c.req.param("guildId");

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (guildId) {
    const hasAccess = await userHasManageGuild(user.id, guildId);
    if (!hasAccess) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  await next();
}

rulesApp.use("*", requireGuildAdmin);

rulesApp.post("/", zValidator("json", createRuleSchema), async (c) => {
  const guildId = c.req.param("guildId")!;
  const { ruleText } = c.req.valid("json");

  const [rule] = await db
    .insert(rules)
    .values({ guildId, ruleText })
    .returning();

  return c.json(rule, 201);
});

rulesApp.get("/", async (c) => {
  const guildId = c.req.param("guildId")!;

  const result = await db
    .select()
    .from(rules)
    .where(eq(rules.guildId, guildId))
    .orderBy(rules.createdAt);

  return c.json(result);
});

rulesApp.put("/:ruleId", zValidator("json", updateRuleSchema), async (c) => {
  const guildId = c.req.param("guildId")!;
  const ruleId = c.req.param("ruleId")!;
  const { ruleText } = c.req.valid("json");

  const [rule] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, ruleId), eq(rules.guildId, guildId)));

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  const [updated] = await db
    .update(rules)
    .set({ ruleText })
    .where(eq(rules.id, ruleId))
    .returning();

  return c.json(updated);
});

rulesApp.delete("/:ruleId", async (c) => {
  const guildId = c.req.param("guildId")!;
  const ruleId = c.req.param("ruleId")!;

  const [rule] = await db
    .select()
    .from(rules)
    .where(and(eq(rules.id, ruleId), eq(rules.guildId, guildId)));

  if (!rule) {
    return c.json({ error: "Rule not found" }, 404);
  }

  await db.delete(rules).where(eq(rules.id, ruleId));

  return c.json({ deleted: true });
});

export default rulesApp;
