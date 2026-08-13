import { describe, expect, it } from "vitest";
import { getNextFocusIndex } from "./SettingsDialog";

describe("getNextFocusIndex", () => {
  it("wraps Tab and Shift+Tab within a dialog's focusable controls", () => {
    expect(getNextFocusIndex(3, 2, false)).toBe(0);
    expect(getNextFocusIndex(3, 0, true)).toBe(2);
    expect(getNextFocusIndex(3, 1, false)).toBe(2);
  });
});
