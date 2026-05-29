import { db, snapshots } from "@repo/db";
import { lt } from "drizzle-orm";
import { logger } from "../utils/logger";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete snapshots where expires_at < now.
 * Returns the number of snapshots deleted.
 */
export async function cleanupExpiredSnapshots(): Promise<number> {
  const now = new Date();

  // Find expired snapshots
  const expired = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(lt(snapshots.expiresAt, now));

  if (expired.length === 0) return 0;

  // Delete expired snapshots
  await db.delete(snapshots).where(lt(snapshots.expiresAt, now));

  const count = expired.length;
  if (count > 0) {
    logger.info(`[cleanup] Deleted ${count} expired snapshot(s)`);
  }
  return count;
}

/**
 * Start a periodic cleanup job.
 * Runs immediately once, then every 24 hours.
 * Returns a function to stop the job.
 */
export function startSnapshotCleanupJob(): () => void {
  // Run once immediately
  cleanupExpiredSnapshots().catch((err) => {
    logger.error(err, "[cleanup] Initial snapshot cleanup failed");
  });

  // Schedule daily
  const interval = setInterval(() => {
    cleanupExpiredSnapshots().catch((err) => {
      logger.error(err, "[cleanup] Scheduled snapshot cleanup failed");
    });
  }, ONE_DAY_MS);

  return () => clearInterval(interval);
}
