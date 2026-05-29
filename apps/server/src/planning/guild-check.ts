import { botHasAdministrator } from "../bot/permissions";
import { guildCache } from "../bot/cache";

/**
 * Check whether a guild is operable by the bot.
 * A guild is operable if:
 * 1. It exists in the bot's cache (bot is in the guild)
 * 2. The bot has ADMINISTRATOR permission in the guild
 *
 * Returns an object with `ok` boolean and `error` message if not ok.
 */
export function checkGuildOperable(guildId: string):
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 404 | 403;
      error: string;
    } {
  if (!guildCache.has(guildId)) {
    return {
      ok: false,
      status: 404,
      error: "Guild not found",
    };
  }

  if (!botHasAdministrator(guildId)) {
    return {
      ok: false,
      status: 403,
      error:
        "Bot lacks ADMINISTRATOR permission in this guild. " +
        "The bot must have ADMINISTRATOR to operate safely.",
    };
  }

  return { ok: true };
}
