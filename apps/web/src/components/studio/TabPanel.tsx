import { X } from "lucide-react";
import type { Tab } from "../../stores/studioStore";

interface TabPanelProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * VSCode-style tab bar. The whole tab body is clickable to select it;
 * closable tabs also expose an X that stops propagation so it can
 * fire onClose without triggering select.
 *
 * Overflow: if the tab strip is wider than its container, it
 * horizontally scrolls. A `›` chevron overflow menu can be added
 * in a later phase if real usage shows tabs getting crowded.
 */
export default function TabPanel({ tabs, activeTabId, onSelect, onClose }: TabPanelProps) {
  if (tabs.length === 0) return null;

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
    </div>
  );
}
