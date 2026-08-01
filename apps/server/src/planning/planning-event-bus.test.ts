import { describe, expect, it, vi } from "vitest";
import {
  clearConversationEvents,
  emitConversationEvent,
  subscribeToConversation,
} from "./planning-event-bus";

describe("planning event bus", () => {
  it("replays a terminal event emitted before the SSE subscriber attaches", () => {
    const conversationId = "conversation-completed-before-subscribe";
    const callback = vi.fn();

    emitConversationEvent(conversationId, {
      type: "completed",
      summary: "Planning finished",
    });
    const unsubscribe = subscribeToConversation(conversationId, callback);

    expect(callback).toHaveBeenCalledWith({
      type: "completed",
      summary: "Planning finished",
    });

    unsubscribe();
    clearConversationEvents(conversationId);
  });

  it("replaces a previous terminal event when a new turn starts", () => {
    const conversationId = "conversation-revised-after-completion";
    const callback = vi.fn();

    emitConversationEvent(conversationId, { type: "completed", summary: "Old result" });
    emitConversationEvent(conversationId, { type: "turn_started" });
    const unsubscribe = subscribeToConversation(conversationId, callback);

    expect(callback).not.toHaveBeenCalled();

    unsubscribe();
    clearConversationEvents(conversationId);
  });
});
