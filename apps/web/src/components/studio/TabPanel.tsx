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
    <div role="tablist" className="relative border-b border-shell-border bg-black px-3 py-2">
      <div className="flex items-center gap-1 overflow-x-auto pr-10">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              className={`group inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors shrink-0 cursor-pointer ${
                isActive
                  ? "bg-shell-surface3 text-shell-text shadow-sm"
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
                  className="text-shell-text-subtle hover:text-shell-text p-0.5 -mr-1 rounded"
                >
                  <X size={11} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      {showAdd && (
        <div className="absolute right-3 top-2" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open new tab"
            className="rounded px-2.5 py-2 text-shell-text-muted transition-colors hover:bg-shell-surface2 hover:text-shell-text"
          >
            <Plus size={13} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 min-w-[190px] rounded border border-shell-border bg-shell-surface p-1.5 shadow-xl shadow-black/50">
              {addOptions!.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => {
                    setMenuOpen(false);
                    onAdd!(opt.type);
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-shell-text transition-colors hover:bg-shell-surface2"
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
