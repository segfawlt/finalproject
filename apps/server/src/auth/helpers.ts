import { queryClient } from "@repo/db";
import { botClient } from "../bot/client";
import { PermissionFlagsBits } from "discord.js";

export async function getUserDiscordId(userId: string): Promise<string | null> {
  const result = await queryClient<[{ provider_account_id: string }?]>`
    SELECT "provider_account_id" FROM "account"
    WHERE "user_id" = ${userId} AND "provider_id" = 'discord'
    LIMIT 1
  `;
  return result[0]?.provider_account_id ?? null;
}

export async function userHasManageGuild(userId: string, guildId: string): Promise<boolean> {
  const discordId = await getUserDiscordId(userId);
  if (!discordId) return false;

  if (!botClient.isReady()) return false;

  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(discordId);
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  } catch {
    return false;
  }
}
