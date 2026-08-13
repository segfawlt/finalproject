// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  clampPanelWidth,
  readStudioShellLayout,
  useStudioShellLayout,
} from "./useStudioShellLayout";

describe("studio shell layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("clamps each panel without consuming the flexible center", () => {
    expect(clampPanelWidth("left", 100)).toBe(220);
    expect(clampPanelWidth("left", 900)).toBe(420);
    expect(clampPanelWidth("right", 100)).toBe(320);
    expect(clampPanelWidth("right", 900)).toBe(720);
  });

  it("falls back when persisted data is invalid", () => {
    window.localStorage.setItem("studio-shell-layout-v1", "not-json");
    expect(readStudioShellLayout()).toEqual({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftVisible: true,
      rightVisible: true,
    });
  });

  it("persists width and visibility transitions", () => {
    const layout = useStudioShellLayout.getState();
    layout.setLeftWidth(300);
    layout.toggleRight();

    expect(readStudioShellLayout()).toEqual({
      leftWidth: 300,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftVisible: true,
      rightVisible: false,
    });
  });
});
