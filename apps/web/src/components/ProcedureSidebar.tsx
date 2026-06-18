import { useState } from "react";
import { Check, Circle, ArrowRight } from "lucide-react";

const PHASE_ORDER = ["foundation", "layout", "access", "people"] as const;

const PHASE_NAMES: Record<string, string> = {
  foundation: "Foundation",
  layout: "Layout",
  access: "Access Control",
  people: "People",
};

const PHASE_PROMPTS: Record<string, string> = {
  foundation:
    "Define roles only. Set names, colors, base permissions, position. " +
    "Do NOT create categories, channels, or set permission overwrites.",

  layout:
    "Create categories and channel structure. Set types, positions, parents, " +
    "forum tags. Default lock_permissions: true on channels under categories. " +
    "Do NOT modify roles or set permission overwrites.",

  access:
    "Set permission overwrites on categories and channels. " +
    "Default: lock_permissions: true. Permissions go on categories. " +
    "Only un-sync channels that genuinely need different access. " +
    "Do NOT create new channels or modify roles.",

  people:
    "Assign members to existing roles. " + "Do NOT create roles or modify permissions or channels.",
};

export interface PhaseProgress {
  foundation: boolean;
  layout: boolean;
  access: boolean;
  people: boolean;
}

interface ProcedureSidebarProps {
  phaseProgress: PhaseProgress;
  onSendPrompt: (prompt: string, phase: string) => void;
  selectedPhase: string | null;
  onSelectPhase: (phase: string | null) => void;
}

function getDeprecationWarning(selected: string, progress: PhaseProgress): string | null {
  const idx = PHASE_ORDER.indexOf(selected as (typeof PHASE_ORDER)[number]);
  const later = PHASE_ORDER.slice(idx + 1).filter((p) => progress[p]);
  if (later.length === 0) return null;

  const laterNames = later.map((p) => PHASE_NAMES[p]).join(" and ");
  return (
    `You've already completed ${laterNames}. ` +
    `Going back to ${PHASE_NAMES[selected]} may affect resources created since.`
  );
}

export default function ProcedureSidebar({
  phaseProgress,
  onSendPrompt,
  selectedPhase,
  onSelectPhase,
}: ProcedureSidebarProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);

  function handlePhaseClick(phase: string) {
    if (selectedPhase === phase) {
      onSelectPhase(null);
      return;
    }
    const warning = getDeprecationWarning(phase, phaseProgress);
    if (warning) {
      setEditingPrompt(phase);
      setShowWarning(true);
    } else {
      onSelectPhase(phase);
    }
  }

  function handleConfirmWarning() {
    setShowWarning(false);
    if (editingPrompt) {
      onSelectPhase(editingPrompt);
    }
  }

  function handleCancelWarning() {
    setShowWarning(false);
    setEditingPrompt(null);
  }

  function handleSendPrompt() {
    if (selectedPhase) {
      onSendPrompt(PHASE_PROMPTS[selectedPhase], selectedPhase);
    }
  }

  return (
    <div className="w-64 shrink-0 bg-discord-bg-tertiary border-l border-discord-divider p-4 flex flex-col h-full">
      <div className="text-sm font-semibold text-discord-text mb-3">Recommended order</div>

      <div className="space-y-2 mb-4">
        {PHASE_ORDER.map((phase) => {
          const completed = phaseProgress[phase];
          const isSelected = selectedPhase === phase;

          return (
            <button
              key={phase}
              onClick={() => handlePhaseClick(phase)}
              className={`w-full text-left px-3 py-2 rounded text-sm transition flex items-center gap-2 ${
                isSelected
                  ? "bg-discord-accent text-white"
                  : completed
                    ? "bg-discord-bg-secondary text-discord-green"
                    : "bg-discord-bg-secondary text-discord-text-muted hover:bg-discord-channel-hover"
              }`}
            >
              {completed ? (
                <Check size={14} className="shrink-0" />
              ) : (
                <Circle size={14} className="shrink-0" />
              )}
              {PHASE_NAMES[phase]}
            </button>
          );
        })}
      </div>

      <div className="border-t border-discord-divider my-3" />

      {selectedPhase ? (
        <div className="flex-1 flex flex-col">
          <div className="text-sm text-discord-text-link mb-2">
            Phase: {PHASE_NAMES[selectedPhase]}
          </div>
          <button
            onClick={handleSendPrompt}
            className="w-full px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded text-sm transition flex items-center justify-center gap-2"
          >
            Use prompt <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="text-xs text-discord-text-muted">
          Select a phase above to use its predefined prompt, or type your own prompt below.
        </div>
      )}

      {showWarning && editingPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-discord-bg-secondary border border-discord-divider rounded-lg p-6 max-w-md mx-4">
            <div className="text-sm text-discord-yellow mb-4">
              {getDeprecationWarning(editingPrompt, phaseProgress)}
              {" Continue anyway?"}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelWarning}
                className="px-4 py-2 bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white rounded text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWarning}
                className="px-4 py-2 bg-discord-yellow hover:bg-discord-yellow/80 text-discord-bg-tertiary rounded text-sm transition"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
