import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Tab, TabType } from "../../stores/studioStore";

export interface AddOption {
  type: TabType;
  label: string;
}

interface TabPanelProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** When provided with `addOptions`, the panel renders a "+" menu
   *  that calls this handler when an option is picked. */
  onAdd?: (type: TabType) => void;
  addOptions?: AddOption[];
}

/**
 * VSCode-style tab bar. The whole tab body is clickable to select it;
 * closable tabs also expose an X that stops propagation so it can
 * fire onClose without triggering select.
 *
 * When `onAdd` and `addOptions` are passed, a trailing "+" button
 * opens a small menu for opening new contextual tabs.
 */
export default function TabPanel({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onAdd,
  addOptions,
}: TabPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the + menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const showAdd = Boolean(onAdd && addOptions && addOptions.length > 0);

  return (
    <div
      role="tablist"
      className="flex border-b border-shell-border bg-shell-surface overflow-x-auto"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={`group inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-r border-shell-border transition-colors shrink-0 cursor-pointer ${
              isActive
                ? "bg-shell-canvas text-shell-text"
                : "text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2"
            }`}
          >
            <span className="truncate max-w-[140px]">{tab.title}</span>
            {tab.closable && (
              <span
                role="button"
                aria-label={`Close ${tab.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className="text-shell-text-subtle hover:text-shell-text p-0.5 -mr-1 rounded-sm"
              >
                <X size={11} />
              </span>
            )}
          </div>
        );
      })}

      {showAdd && (
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open new tab"
            className="px-2 py-2 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 transition-colors"
          >
            <Plus size={13} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 min-w-[160px] rounded-md border border-shell-border bg-shell-surface shadow-lg shadow-black/30 py-1">
              {addOptions!.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => {
                    setMenuOpen(false);
                    onAdd!(opt.type);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-shell-text hover:bg-shell-surface2 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
