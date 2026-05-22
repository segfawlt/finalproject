import { queryClient } from "@repo/db";
import { botClient } from "../bot/client";
import { PermissionFlagsBits } from "discord.js";

export async function getUserDiscordId(userId: string): Promise<string | null> {
  const result = await queryClient<[{ providerAccountId: string }?]>`
    SELECT "providerAccountId" FROM "account"
    WHERE "userId" = ${userId} AND "providerId" = 'discord'
    LIMIT 1
  `;
  return result[0]?.providerAccountId ?? null;
}

export async function userHasManageGuild(
  userId: string,
  guildId: string,
): Promise<boolean> {
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
