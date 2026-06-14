import { db, guilds } from "@repo/db";
import { eq, and, isNull, sql, lt, isNotNull } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * Default lock TTL. A lock older than this is considered stale even with a
 * recent heartbeat, providing a hard upper bound on lock lifetime.
 */
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * Default heartbeat staleness window. A lock whose last heartbeat is older
 * than this is considered abandoned by its holder and is safe to clear.
 */
const DEFAULT_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

/**
 * Acquire a guild lock for plan execution.
 * Only one plan can execute per guild at a time.
 *
 * Uses a conditional UPDATE to prevent race conditions between concurrent
 * acquire attempts. The update only succeeds if current_plan_id IS NULL.
 *
 * On success, records the holder process id, acquisition time, and an initial
 * heartbeat so a liveness check can later decide if the holder is still alive.
 *
 * Returns true if the lock was acquired, false if the guild is already locked.
 */
export async function acquireGuildLock(
  guildId: string,
  planId: string,
  ownerId: string = process.pid.toString()
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(guilds)
    .set({
      currentPlanId: planId,
      lockAcquiredAt: now,
      lockAcquiredBy: ownerId,
      lockLastHeartbeatAt: now,
    })
    .where(and(eq(guilds.id, guildId), isNull(guilds.currentPlanId)))
    .returning();

  return !!updated;
}

/**
 * Refresh the heartbeat timestamp for a lock the current owner still holds.
 * Does not change the owner. If the guild is not locked by the given owner
 * the call is a no-op, so a stale process cannot accidentally resurrect a
 * lock that was already cleared.
 */
export async function heartbeatGuildLock(
  guildId: string,
  ownerId: string = process.pid.toString()
): Promise<void> {
  const now = new Date();
  await db
    .update(guilds)
    .set({ lockLastHeartbeatAt: now })
    .where(
      and(
        eq(guilds.id, guildId),
        eq(guilds.lockAcquiredBy, ownerId),
        isNotNull(guilds.currentPlanId)
      )
    );
}

/**
 * Release the guild lock after plan execution completes or fails.
 * Only the owner can release its own lock; a different process calling this
 * with a mismatched ownerId is ignored, so a delayed callback from a crashed
 * process cannot clear a lock that has already been taken over.
 */
export async function releaseGuildLock(
  guildId: string,
  ownerId: string = process.pid.toString()
): Promise<void> {
  await db
    .update(guilds)
    .set({
      currentPlanId: null,
      lockAcquiredAt: null,
      lockAcquiredBy: null,
      lockLastHeartbeatAt: null,
    })
    .where(and(eq(guilds.id, guildId), eq(guilds.lockAcquiredBy, ownerId)));
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
 *
 * A lock is considered stale if any of:
 *  - it has no heartbeat recorded (older schema/data)
 *  - its last heartbeat is older than the heartbeat staleness window
 *  - it is older than the absolute TTL
 */
export async function clearStaleLocks(
  options: { heartbeatStaleMs?: number; ttlMs?: number } = {}
): Promise<number> {
  const heartbeatStaleMs = options.heartbeatStaleMs ?? DEFAULT_HEARTBEAT_STALE_MS;
  const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const now = Date.now();
  const heartbeatCutoff = new Date(now - heartbeatStaleMs);
  const ttlCutoff = new Date(now - ttlMs);

  const stale = await db
    .select({ id: guilds.id })
    .from(guilds)
    .where(
      and(
        isNotNull(guilds.currentPlanId),
        sql`(${guilds.lockLastHeartbeatAt} IS NULL OR ${guilds.lockLastHeartbeatAt} < ${heartbeatCutoff} OR ${guilds.lockAcquiredAt} < ${ttlCutoff})`
      )
    );

  if (stale.length === 0) return 0;

  await db
    .update(guilds)
    .set({
      currentPlanId: null,
      lockAcquiredAt: null,
      lockAcquiredBy: null,
      lockLastHeartbeatAt: null,
    })
    .where(
      and(
        isNotNull(guilds.currentPlanId),
        sql`(${guilds.lockLastHeartbeatAt} IS NULL OR ${guilds.lockLastHeartbeatAt} < ${heartbeatCutoff} OR ${guilds.lockAcquiredAt} < ${ttlCutoff})`
      )
    );

  logger.info(
    { clearedCount: stale.length, heartbeatStaleMs, ttlMs },
    "Cleared stale guild locks"
  );
  return stale.length;
}

/**
 * Start a periodic cleanup of stale guild locks.
 * Runs every 5 minutes. Returns a cleanup function to stop the interval.
 */
export function startPeriodicLockCleanup(
  options: { intervalMs?: number; heartbeatStaleMs?: number; ttlMs?: number } = {}
): () => void {
  const intervalMs = options.intervalMs ?? 5 * 60 * 1000;
  const interval = setInterval(() => {
    clearStaleLocks({
      heartbeatStaleMs: options.heartbeatStaleMs,
      ttlMs: options.ttlMs,
    }).catch((err) => {
      logger.error(err, "Periodic stale lock cleanup failed");
    });
  }, intervalMs);

  return () => clearInterval(interval);
}
