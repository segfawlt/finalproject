import { db, guilds } from "@repo/db";
import { eq, isNotNull, and, isNull } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * Acquire a guild lock for plan execution.
 * Only one plan can execute per guild at a time.
 *
 * Uses a conditional UPDATE to prevent race conditions between concurrent
 * acquire attempts. The update only succeeds if current_plan_id IS NULL.
 *
 * Returns true if the lock was acquired, false if the guild is already locked.
 */
export async function acquireGuildLock(guildId: string, planId: string): Promise<boolean> {
  const [updated] = await db
    .update(guilds)
    .set({ currentPlanId: planId })
    .where(
      and(
        eq(guilds.id, guildId),
        isNull(guilds.currentPlanId) // atomic: only acquire if not already locked
      )
    )
    .returning();

  return !!updated;
}

/**
 * Release the guild lock after plan execution completes or fails.
 */
export async function releaseGuildLock(guildId: string): Promise<void> {
  await db.update(guilds).set({ currentPlanId: null }).where(eq(guilds.id, guildId));
}

/**
 * Check whether a guild is currently locked (has an active plan executing).
 */
export async function isGuildLocked(guildId: string): Promise<boolean> {
  const [row] = await db
    .select({ currentPlanId: guilds.currentPlanId })
    .from(guilds)
    .where(eq(guilds.id, guildId));

  return !!row?.currentPlanId;
}

/**
 * Clear all stale guild locks on process startup.
 * Called once when the server boots to recover from a previous crash.
 */
export async function clearStaleLocks(): Promise<number> {
  const locked = await db
    .select({ id: guilds.id })
    .from(guilds)
    .where(isNotNull(guilds.currentPlanId));

  if (locked.length === 0) return 0;

  await db.update(guilds).set({ currentPlanId: null }).where(isNotNull(guilds.currentPlanId));

  logger.info({ clearedCount: locked.length }, "Cleared stale guild locks");
  return locked.length;
}

/**
 * Start a periodic cleanup of stale guild locks.
 * Runs every 5 minutes. Returns a cleanup function to stop the interval.
 */
export function startPeriodicLockCleanup(): () => void {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const interval = setInterval(() => {
    clearStaleLocks().catch((err) => {
      logger.error(err, "Periodic stale lock cleanup failed");
    });
  }, FIVE_MINUTES_MS);

  return () => clearInterval(interval);
}
