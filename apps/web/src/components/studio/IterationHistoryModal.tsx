import { useState } from "react";
import { History, Loader, RotateCcw, X } from "lucide-react";
import DesiredStateView from "../DesiredStateView";
import type { IterationRow, IterationType } from "../../hooks/useConversation";

interface IterationHistoryModalProps {
  open: boolean;
  onClose: () => void;
  iterations: IterationRow[];
  currentVersion: number | null;
  onRevert: (version: number) => Promise<void>;
}

/**
 * Popout modal showing the iteration timeline for the active
 * conversation. Click an iteration to preview its DesiredState,
 * Revert to make it current, or close the modal to keep the
 * current state.
 */
export default function IterationHistoryModal({
  open,
  onClose,
  iterations,
  currentVersion,
  onRevert,
}: IterationHistoryModalProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);

  if (!open) return null;

  const sorted = [...iterations].sort((a, b) => b.version - a.version);
  const selectedRow =
    selectedVersion === null
      ? null
      : (sorted.find((i) => i.version === selectedVersion) ?? null);

  async function handleRevert(version: number) {
    if (reverting !== null) return;
    setReverting(version);
    try {
      await onRevert(version);
      // Stay open so the user can see the new state and continue
      // browsing — modal closes via the X / backdrop.
    } finally {
      setReverting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Iteration history"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-shell-surface border border-shell-border rounded-lg shadow-2xl shadow-black/50 w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-shell-border">
          <div className="flex items-center gap-2">
            <History size={15} className="text-shell-text-muted" />
            <h2 className="text-shell-text font-semibold text-sm">Iteration history</h2>
            <span className="text-shell-text-muted text-xs">
              ({iterations.length})
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body: timeline + preview */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {iterations.length === 0 ? (
            <div className="text-shell-text-muted text-sm">No iterations yet.</div>
          ) : (
            <>
              <ol className="space-y-1">
                {sorted.map((iter) => {
                  const isCurrent = currentVersion !== null && iter.version === currentVersion;
                  const isSelected = selectedVersion === iter.version;
                  const isReverting = reverting === iter.version;
                  return (
                    <li
                      key={iter.id}
                      className={`group flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors ${
                        isSelected
                          ? "bg-shell-accent/20 border border-shell-accent/40"
                          : "bg-shell-surface2 border border-shell-border hover:border-shell-border-strong"
                      }`}
                    >
                      <button
                        onClick={() =>
                          setSelectedVersion(isSelected ? null : iter.version)
                        }
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        <span className="font-mono text-shell-text">v{iter.version}</span>
                        <TypeBadge type={iter.type} />
                        <span className="text-shell-text-muted truncate">
                          {formatTime(iter.createdAt)}
                        </span>
                        {isCurrent && (
                          <span className="text-agent-done text-[10px] uppercase tracking-wider font-semibold">
                            current
                          </span>
                        )}
                      </button>
                      {!isCurrent && (
                        <button
                          onClick={() => handleRevert(iter.version)}
                          disabled={reverting !== null}
                          className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 bg-agent-done/20 text-agent-done border border-agent-done/40 hover:bg-agent-done/30 disabled:opacity-50 disabled:cursor-not-allowed rounded text-[11px] font-medium transition-colors"
                        >
                          {isReverting ? (
                            <Loader size={11} className="animate-spin" />
                          ) : (
                            <RotateCcw size={11} />
                          )}
                          {isReverting ? "Reverting…" : "Revert"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>

              {selectedRow && (
                <div className="rounded-md border border-shell-border bg-shell-canvas p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-shell-text-muted">
                      Previewing v{selectedRow.version} — read-only
                    </span>
                    <button
                      onClick={() => setSelectedVersion(null)}
                      aria-label="Close preview"
                      className="text-shell-text-muted hover:text-shell-text p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <DesiredStateView desiredState={selectedRow.desiredState} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: IterationType }) {
  const { label, cls } = badgeFor(type);
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function badgeFor(t: IterationType): { label: string; cls: string } {
  switch (t) {
    case "llm_generated":
      return { label: "LLM", cls: "bg-agent-reading/30 text-agent-reading" };
    case "manual_edit":
      return { label: "Edit", cls: "bg-agent-editing/30 text-agent-editing" };
    case "revert":
      return { label: "Revert", cls: "bg-agent-done/30 text-agent-done" };
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
