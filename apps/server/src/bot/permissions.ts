import { PermissionFlagsBits } from "discord.js";
import { botClient } from "./client";

/**
 * Check whether the bot has ADMINISTRATOR permission in a guild.
 * Returns false if the bot is not in the guild or permissions cannot be determined.
 */
export function botHasAdministrator(guildId: string): boolean {
  if (!botClient.isReady()) return false;

  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) return false;

  const me = guild.members.me;
  if (!me) return false;

  return me.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Get the bot's highest role position in a guild.
 * Returns -1 if the bot is not in the guild or roles cannot be determined.
 */
export function getBotHighestRolePosition(guildId: string): number {
  if (!botClient.isReady()) return -1;

  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) return -1;

  const me = guild.members.me;
  if (!me) return -1;

  return me.roles.highest.position;
}

/**
 * Validate that the bot has ADMINISTRATOR in the given guild.
 * Throws a clear error if not.
 */
export function requireBotAdministrator(guildId: string): void {
  if (!botHasAdministrator(guildId)) {
    throw new Error(
      `Bot lacks ADMINISTRATOR permission in guild ${guildId}. ` +
        "The bot must have ADMINISTRATOR to operate safely."
    );
  }
}
