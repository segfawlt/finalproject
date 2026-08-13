import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { clampPanelWidth, useStudioShellLayout } from "../../hooks/useStudioShellLayout";

interface StudioShellProps {
  header?: ReactNode | ((restoreControls: ReactNode) => ReactNode);
  sidebar?: ReactNode;
  children: ReactNode;
  rightPanel?: ReactNode;
}

type PanelSide = "left" | "right";

export default function StudioShell({ header, sidebar, children, rightPanel }: StudioShellProps) {
  const leftWidth = useStudioShellLayout((state) => state.leftWidth);
  const rightWidth = useStudioShellLayout((state) => state.rightWidth);
  const setLeftWidth = useStudioShellLayout((state) => state.setLeftWidth);
  const setRightWidth = useStudioShellLayout((state) => state.setRightWidth);
  const resetLeftWidth = useStudioShellLayout((state) => state.resetLeftWidth);
  const resetRightWidth = useStudioShellLayout((state) => state.resetRightWidth);
  const dragging = useRef<PanelSide | null>(null);

  function updateWidth(side: PanelSide, clientX: number) {
    if (side === "left") setLeftWidth(clientX);
    else if (typeof window !== "undefined") setRightWidth(window.innerWidth - clientX);
  }

  function startResize(side: PanelSide, event: PointerEvent<HTMLDivElement>) {
    dragging.current = side;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateWidth(side, event.clientX);
  }

  function finishResize() {
    dragging.current = null;
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) updateWidth(dragging.current, event.clientX);
  }

  function handleKeyDown(side: PanelSide, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      if (side === "left") setLeftWidth(220);
      else setRightWidth(320);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (side === "left") setLeftWidth(420);
      else setRightWidth(720);
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const delta = direction * (event.shiftKey ? 48 : 16);
    const current = side === "left" ? leftWidth : rightWidth;
    const next = clampPanelWidth(side, current + delta);
    if (side === "left") setLeftWidth(next);
    else setRightWidth(next);
  }

  const separator = (side: PanelSide) => (
    <div
      role="separator"
      aria-label={side === "left" ? "Resize navigation" : "Resize preview"}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={(event) => startResize(side, event)}
      onPointerMove={handlePointerMove}
      onPointerUp={finishResize}
      onDoubleClick={side === "left" ? resetLeftWidth : resetRightWidth}
      onKeyDown={(event) => handleKeyDown(side, event)}
      className="hidden lg:block w-px shrink-0 cursor-col-resize bg-shell-border hover:bg-shell-border-strong focus:bg-shell-border-strong focus:outline-none"
    />
  );

  return (
    <div className="h-full flex-1 flex flex-col min-h-0 overflow-hidden bg-shell-canvas text-shell-text">
      {header && (
        <div className="relative shrink-0">
          {typeof header === "function" ? header(null) : header}
        </div>
      )}
      <div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
        {sidebar && (
          <aside
            style={{ "--panel-width": `${leftWidth}px` } as React.CSSProperties}
            className="absolute inset-y-0 left-0 z-20 w-[min(85vw,var(--panel-width))] shrink-0 border-r border-shell-border bg-shell-surface overflow-visible lg:static lg:flex lg:min-h-0 lg:flex-col lg:w-[var(--panel-width)]"
          >
            {sidebar}
          </aside>
        )}
        {sidebar && separator("left")}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</main>
        {rightPanel && separator("right")}
        {rightPanel && (
          <aside
            style={{ "--panel-width": `${rightWidth}px` } as React.CSSProperties}
            className="absolute inset-y-0 right-0 z-20 w-[min(90vw,var(--panel-width))] shrink-0 border-l border-shell-border bg-shell-surface overflow-visible lg:static lg:flex lg:min-h-0 lg:flex-col lg:w-[var(--panel-width)]"
          >
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
