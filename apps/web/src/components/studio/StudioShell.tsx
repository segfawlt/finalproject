import type { ReactNode } from "react";

interface StudioShellProps {
  /** Top header bar (Phase 2). */
  header?: ReactNode;
  /** Left conversation history sidebar (Phase 3). */
  sidebar?: ReactNode;
  /** Center column: chat area. */
  children: ReactNode;
  /** Right tabbed preview panel (Phase 6). */
  rightPanel?: ReactNode;
}

/**
 * Three-column chat-native layout for the Studio.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ header                                         │
 *   ├────────┬──────────────────────────┬───────────┤
 *   │ sidebar│  children (chat)         │ rightPanel│
 *   └────────┴──────────────────────────┴───────────┘
 *
 * Columns collapse when their slot is not provided, so the same shell
 * scales from "guild picker only" to "full 3-column IDE-like" without
 * a separate layout component.
 */
export default function StudioShell({ header, sidebar, children, rightPanel }: StudioShellProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-shell-canvas text-shell-text">
      {header}
      <div className="flex flex-1 min-h-0">
        {sidebar && (
          <aside className="w-64 shrink-0 border-r border-shell-border bg-shell-surface overflow-y-auto">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
        {rightPanel && (
          <aside className="w-[480px] shrink-0 border-l border-shell-border bg-shell-surface overflow-y-auto">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
