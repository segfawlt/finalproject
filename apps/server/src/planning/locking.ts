import { db as defaultDb, guilds } from "@repo/db";
import { eq, and, isNull, sql, isNotNull } from "drizzle-orm";
import { logger } from "../utils/logger";

type Db = typeof defaultDb;

const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000;
const DEFAULT_HEARTBEAT_STALE_MS = 5 * 60 * 1000;

export async function acquireGuildLock(
  guildId: string,
  planId: string,
  ownerId: string = process.pid.toString(),
  db: Db = defaultDb
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

export async function heartbeatGuildLock(
  guildId: string,
  ownerId: string = process.pid.toString(),
  db: Db = defaultDb
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

export async function releaseGuildLock(
  guildId: string,
  ownerId: string = process.pid.toString(),
  db: Db = defaultDb
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

export async function isGuildLocked(guildId: string, db: Db = defaultDb): Promise<boolean> {
  const [row] = await db
    .select({ currentPlanId: guilds.currentPlanId })
    .from(guilds)
    .where(eq(guilds.id, guildId));

  return !!row?.currentPlanId;
}

export async function clearStaleLocks(
  options: { heartbeatStaleMs?: number; ttlMs?: number; db?: Db } = {}
): Promise<number> {
  const db = options.db ?? defaultDb;
  const heartbeatStaleMs = options.heartbeatStaleMs ?? DEFAULT_HEARTBEAT_STALE_MS;
  const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const now = Date.now();
  const heartbeatCutoff = new Date(now - heartbeatStaleMs).toISOString();
  const ttlCutoff = new Date(now - ttlMs).toISOString();

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

  logger.info({ clearedCount: stale.length, heartbeatStaleMs, ttlMs }, "Cleared stale guild locks");
  return stale.length;
}

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
