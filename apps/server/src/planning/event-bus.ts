import type { ExecutionEvent } from "./execution-engine";
import { logger } from "../utils/logger";

/**
 * In-memory event bus for bridging execution engine events to SSE streams.
 *
 * When a plan starts executing, the execution engine emits events here.
 * The SSE endpoint for that plan subscribes to receive them.
 *
 * This only works in a monolith. If the backend is split across processes,
 * replace with Redis pub/sub or similar.
 */

interface Subscriber {
  (event: ExecutionEvent): void;
}

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeToPlan(planId: string, callback: Subscriber): () => void {
  if (!subscribers.has(planId)) {
    subscribers.set(planId, new Set());
  }
  subscribers.get(planId)!.add(callback);

  return () => {
    subscribers.get(planId)?.delete(callback);
    if (subscribers.get(planId)?.size === 0) {
      subscribers.delete(planId);
    }
  };
}

export function emitPlanEvent(planId: string, event: ExecutionEvent): void {
  const subs = subscribers.get(planId);
  if (subs) {
    for (const callback of subs) {
      try {
        callback(event);
      } catch (err) {
        logger.error(err, "[event-bus] Subscriber error");
        subs.delete(callback);
      }
    }
  }
}
