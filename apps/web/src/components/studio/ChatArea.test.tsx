// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DESIRED_STATE_CARD_CLASS, timeGreeting } from "./ChatArea";

describe("getDesiredStateCardClass", () => {
  it("keeps the desired-state content away from its border", () => {
    expect(DESIRED_STATE_CARD_CLASS).toContain("p-4");
  });
});

describe("timeGreeting", () => {
  it("uses morning, afternoon, and evening boundaries", () => {
    expect(timeGreeting(new Date("2026-08-12T11:59:00"))).toBe("Good morning");
    expect(timeGreeting(new Date("2026-08-12T12:00:00"))).toBe("Good afternoon");
    expect(timeGreeting(new Date("2026-08-12T18:00:00"))).toBe("Good evening");
  });
});
