import type { PlanningEvent } from "./planning-session";
import { logger } from "../utils/logger";

/**
 * In-memory event bus for bridging PlanningSession events to SSE streams.
 *
 * When a planning session starts, the PlanningSession emits events here.
 * The SSE endpoint for that conversation subscribes to receive them.
 *
 * This only works in a monolith. If the backend is split across processes,
 * replace with Redis pub/sub or similar.
 */

interface Subscriber {
  (event: PlanningEvent): void;
}

const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeToConversation(conversationId: string, callback: Subscriber): () => void {
  if (!subscribers.has(conversationId)) {
    subscribers.set(conversationId, new Set());
  }
  subscribers.get(conversationId)!.add(callback);

  return () => {
    subscribers.get(conversationId)?.delete(callback);
    if (subscribers.get(conversationId)?.size === 0) {
      subscribers.delete(conversationId);
    }
  };
}

export function emitConversationEvent(conversationId: string, event: PlanningEvent): void {
  const subs = subscribers.get(conversationId);
  if (subs) {
    for (const callback of subs) {
      try {
        callback(event);
      } catch (err) {
        logger.error(err, "[planning-event-bus] Subscriber error");
        subs.delete(callback);
      }
    }
  }
}
