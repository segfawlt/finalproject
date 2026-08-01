import { eq } from "drizzle-orm";
import { db, rules } from "@repo/db";

export async function loadGuildRuleTexts(guildId: string): Promise<string[]> {
  const rows = await db
    .select({ ruleText: rules.ruleText })
    .from(rules)
    .where(eq(rules.guildId, guildId));

  return rows.map((row) => row.ruleText);
}
