import { queryClient } from "@repo/db";
import { botClient } from "../bot/client";
import { PermissionFlagsBits } from "discord.js";
import { logger } from "../utils/logger";

export async function getUserDiscordId(userId: string): Promise<string | null> {
  const result = await queryClient<[{ provider_account_id: string }?]>`
    SELECT "provider_account_id" FROM "account"
    WHERE "user_id" = ${userId} AND "provider_id" = 'discord'
    LIMIT 1
  `;
  return result[0]?.provider_account_id ?? null;
}

export class DiscordApiError extends Error {
  constructor(public readonly cause: unknown) {
    super("Discord API call failed; see cause");
    this.name = "DiscordApiError";
  }
}

interface AuthCacheEntry {
  value: boolean;
  expiresAt: number;
}
const AUTH_CACHE_TTL_MS = 60_000;
const authCache = new Map<string, AuthCacheEntry>();

function cacheKey(userId: string, guildId: string): string {
  return `${userId}::${guildId}`;
}

export async function userHasManageGuild(userId: string, guildId: string): Promise<boolean> {
  const key = cacheKey(userId, guildId);
  const cached = authCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const discordId = await getUserDiscordId(userId);
  if (!discordId) return false;

  if (!botClient.isReady()) return false;

  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) return false;

  let allowed: boolean;
  try {
    const member = await guild.members.fetch(discordId);
    allowed = member.permissions.has(PermissionFlagsBits.ManageGuild);
  } catch (err) {
    // Don't silently swallow Discord errors as "not allowed" — that turns
    // any transient Discord outage into a 100% auth outage. Surface so
    // the route can return 503 instead of 403.
    logger.error(err, "[auth] guild.members.fetch failed");
    throw new DiscordApiError(err);
  }

  authCache.set(key, { value: allowed, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  return allowed;
}

export function clearAuthCacheForUser(userId: string): void {
  for (const key of authCache.keys()) {
    if (key.startsWith(`${userId}::`)) {
      authCache.delete(key);
    }
  }
}
