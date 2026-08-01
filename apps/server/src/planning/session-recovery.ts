import { conversations, db } from "@repo/db";
import { inArray } from "drizzle-orm";
import { logger } from "../utils/logger";

/**
 * In-flight PlanningSession objects cannot survive a process restart. Mark
 * their persisted rows as interrupted instead of leaving them indefinitely in
 * a status that implies work is still running. Completed conversations remain
 * reviewable and approvable from their persisted latest iteration.
 */
export async function recoverInterruptedPlanningSessions(): Promise<number> {
  const recovered = await db
    .update(conversations)
    .set({ status: "error", updatedAt: new Date() })
    .where(inArray(conversations.status, ["planning", "waiting_for_user"]))
    .returning({ id: conversations.id });

  if (recovered.length > 0) {
    logger.warn(
      { count: recovered.length },
      "Marked interrupted planning conversations as error after restart"
    );
  }

  return recovered.length;
}
