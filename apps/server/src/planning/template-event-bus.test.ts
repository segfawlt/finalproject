import { describe, expect, it, vi } from "vitest";
import { clearTemplateEvents, emitTemplateEvent, subscribeToTemplate } from "./template-event-bus";

describe("template event bus", () => {
  it("replays terminal events by turn and clears replay on a new turn", () => {
    const turnId = "turn-1";
    const callback = vi.fn();

    emitTemplateEvent(turnId, { type: "completed", summary: "Saved" });
    const unsubscribe = subscribeToTemplate(turnId, callback);
    expect(callback).toHaveBeenCalledWith({ type: "completed", summary: "Saved" });

    emitTemplateEvent(turnId, { type: "turn_started" });
    const lateCallback = vi.fn();
    const lateUnsubscribe = subscribeToTemplate(turnId, lateCallback);
    expect(lateCallback).not.toHaveBeenCalled();

    unsubscribe();
    lateUnsubscribe();
    clearTemplateEvents(turnId);
  });

  it("replays cancellation as a terminal event", () => {
    const callback = vi.fn();
    emitTemplateEvent("turn-cancelled", { type: "cancelled" });

    const unsubscribe = subscribeToTemplate("turn-cancelled", callback);

    expect(callback).toHaveBeenCalledWith({ type: "cancelled" });
    unsubscribe();
    clearTemplateEvents("turn-cancelled");
  });
});
