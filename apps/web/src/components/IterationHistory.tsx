import { useState } from "react";
import { History as HistoryIcon, X } from "lucide-react";
import DesiredStateView from "./DesiredStateView";
import type { DesiredState } from "./desired-state/types";
import EmptyState from "./EmptyState";

export type IterationType = "llm_generated" | "manual_edit" | "revert";

export interface IterationRow {
  id: string;
  version: number;
  type: IterationType;
  desiredState: DesiredState;
  createdAt: string;
}

interface IterationHistoryProps {
  iterations: IterationRow[];
  currentVersion: number | null;
  canRevert: boolean;
  onRevert: (version: number) => Promise<void>;
}

export default function IterationHistory({
  iterations,
  currentVersion,
  canRevert,
  onRevert,
}: IterationHistoryProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [reverting, setReverting] = useState<number | null>(null);

  if (iterations.length === 0) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="No prior iterations"
        description="Revise the plan to generate a new version you can revert to."
      />
    );
  }

  const sorted = [...iterations].sort((a, b) => b.version - a.version);
  const selectedRow =
    selectedVersion === null ? null : (sorted.find((i) => i.version === selectedVersion) ?? null);

  async function handleRevert(version: number) {
    if (reverting !== null) return;
    setReverting(version);
    try {
      await onRevert(version);
      setSelectedVersion(null);
    } finally {
      setReverting(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wide text-discord-text-muted font-semibold">
        Iterations ({iterations.length})
      </div>

      <div className="space-y-1 max-h-40 overflow-auto bg-discord-bg-tertiary rounded-md p-2 border border-discord-divider">
        {sorted.map((iter) => {
          const isCurrent = currentVersion !== null && iter.version === currentVersion;
          const isSelected = selectedVersion === iter.version;
          const isReverting = reverting === iter.version;
          return (
            <div
              key={iter.id}
              className={`group flex items-center justify-between px-2 py-1 rounded text-xs transition-colors ${
                isSelected
                  ? "bg-discord-accent/30"
                  : "hover:bg-discord-channel-hover cursor-pointer"
              }`}
            >
              <button
                onClick={() => setSelectedVersion(isSelected ? null : iter.version)}
                className="flex items-center gap-2 flex-1 text-left text-discord-text group-hover:text-white min-w-0 transition-colors"
              >
                <span className="font-mono">v{iter.version}</span>
                <span
                  className={`px-1.5 rounded text-[10px] uppercase tracking-wide ${typeColor(
                    iter.type
                  )}`}
                >
                  {typeLabel(iter.type)}
                </span>
                <span className="text-discord-text-muted truncate">
                  {formatTime(iter.createdAt)}
                </span>
                {isCurrent && (
                  <span className="text-discord-green text-[10px] uppercase">current</span>
                )}
              </button>
              {canRevert && !isCurrent && (
                <button
                  onClick={() => handleRevert(iter.version)}
                  disabled={reverting !== null}
                  className="ml-2 px-2 py-0.5 bg-discord-yellow hover:bg-discord-yellow/80 disabled:bg-discord-bg-tertiary disabled:cursor-not-allowed text-discord-bg-tertiary rounded text-[10px] transition-colors"
                >
                  {isReverting ? "Reverting…" : "Revert"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedRow && (
        <div className="space-y-2 border-t border-discord-divider pt-3">
          <div className="flex items-center justify-between bg-discord-yellow/20 border border-discord-yellow/40 rounded-md px-3 py-2 text-xs">
            <span className="text-discord-yellow">
              Previewing v{selectedRow.version} — read-only, click Revert to make current
            </span>
            <button
              onClick={() => setSelectedVersion(null)}
              className="text-discord-yellow hover:text-white leading-none px-1 flex items-center transition-colors"
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
          </div>
          <DesiredStateView desiredState={selectedRow.desiredState} />
        </div>
      )}
    </div>
  );
}

function typeLabel(t: IterationType): string {
  switch (t) {
    case "llm_generated":
      return "LLM";
    case "manual_edit":
      return "edit";
    case "revert":
      return "revert";
  }
}

function typeColor(t: IterationType): string {
  switch (t) {
    case "llm_generated":
      return "bg-blue-900/60 text-blue-200";
    case "manual_edit":
      return "bg-purple-900/60 text-purple-200";
    case "revert":
      return "bg-discord-yellow/30 text-discord-yellow";
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
