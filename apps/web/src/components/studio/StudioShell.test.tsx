// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import StudioShell from "./StudioShell";
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  useStudioShellLayout,
} from "../../hooks/useStudioShellLayout";

describe("StudioShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useStudioShellLayout.setState({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftVisible: true,
      rightVisible: true,
    });
  });

  it("renders both resizable panels without visibility controls", () => {
    render(
      <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
        <div>chat</div>
      </StudioShell>
    );

    expect(screen.getByText("navigation")).toBeVisible();
    expect(screen.getByText("preview")).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize navigation" })).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize preview" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /navigation|preview/i })).not.toBeInTheDocument();
  });

  it("resets only the double-clicked separator", async () => {
    const user = userEvent.setup();
    useStudioShellLayout.getState().setLeftWidth(340);
    useStudioShellLayout.getState().setRightWidth(680);
    render(
      <StudioShell
        header={(restoreControls) => (
          <header>
            <span>header</span>
            {restoreControls}
          </header>
        )}
        sidebar={<div>navigation</div>}
        rightPanel={<div>preview</div>}
      >
        <div>chat</div>
      </StudioShell>
    );

    await user.dblClick(screen.getByRole("separator", { name: "Resize navigation" }));
    expect(useStudioShellLayout.getState().leftWidth).toBe(DEFAULT_LEFT_WIDTH);
    expect(useStudioShellLayout.getState().rightWidth).toBe(680);
  });

  it("resets the right separator independently", async () => {
    const user = userEvent.setup();
    useStudioShellLayout.getState().setLeftWidth(340);
    useStudioShellLayout.getState().setRightWidth(680);
    render(
      <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
        <div>chat</div>
      </StudioShell>
    );

    await user.dblClick(screen.getByRole("separator", { name: "Resize preview" }));
    expect(useStudioShellLayout.getState().leftWidth).toBe(340);
    expect(useStudioShellLayout.getState().rightWidth).toBe(DEFAULT_RIGHT_WIDTH);
  });

  it("resizes panels with keyboard arrows and clamps pointer movement", async () => {
    const user = userEvent.setup();
    render(
      <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
        <div>chat</div>
      </StudioShell>
    );

    const leftSeparator = screen.getByRole("separator", { name: "Resize navigation" });
    leftSeparator.focus();
    await user.keyboard("{ArrowRight}");
    expect(useStudioShellLayout.getState().leftWidth).toBe(DEFAULT_LEFT_WIDTH + 16);

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    const rightSeparator = screen.getByRole("separator", { name: "Resize preview" });
    rightSeparator.focus();
    await user.keyboard("{ArrowLeft}");
    expect(useStudioShellLayout.getState().rightWidth).toBe(DEFAULT_RIGHT_WIDTH - 16);
    rightSeparator.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 990 }));
    rightSeparator.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 0 }));
    expect(useStudioShellLayout.getState().rightWidth).toBe(720);

    leftSeparator.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0 }));
    expect(useStudioShellLayout.getState().leftWidth).toBe(220);
  });

  it("constrains persisted panel widths on narrow screens", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    useStudioShellLayout.setState({ leftWidth: 420, rightWidth: 720 });
    render(
      <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
        <div>chat</div>
      </StudioShell>
    );

    expect(screen.getAllByRole("complementary")[0].getAttribute("style")).toContain(
      "--panel-width: 420px"
    );
    expect(screen.getAllByRole("complementary")[0]).toHaveClass("w-[min(85vw,var(--panel-width))]");
  });
});
