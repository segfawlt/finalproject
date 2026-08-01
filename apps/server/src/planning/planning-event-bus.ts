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
const terminalEvents = new Map<string, PlanningEvent>();
const MAX_REPLAYED_CONVERSATIONS = 1_000;

function isReplayable(event: PlanningEvent): boolean {
  return ["ask_user", "completed", "error", "expired"].includes(event.type);
}

export function subscribeToConversation(conversationId: string, callback: Subscriber): () => void {
  if (!subscribers.has(conversationId)) {
    subscribers.set(conversationId, new Set());
  }
  subscribers.get(conversationId)!.add(callback);

  const terminalEvent = terminalEvents.get(conversationId);
  if (terminalEvent) {
    callback(terminalEvent);
  }

  return () => {
    subscribers.get(conversationId)?.delete(callback);
    if (subscribers.get(conversationId)?.size === 0) {
      subscribers.delete(conversationId);
    }
  };
}

export function emitConversationEvent(conversationId: string, event: PlanningEvent): void {
  if (isReplayable(event)) {
    if (!terminalEvents.has(conversationId) && terminalEvents.size >= MAX_REPLAYED_CONVERSATIONS) {
      const oldestConversationId = terminalEvents.keys().next().value;
      if (oldestConversationId) terminalEvents.delete(oldestConversationId);
    }
    terminalEvents.set(conversationId, event);
  } else if (event.type === "turn_started") {
    terminalEvents.delete(conversationId);
  }

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

export function clearConversationEvents(conversationId: string): void {
  terminalEvents.delete(conversationId);
}
