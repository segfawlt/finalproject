/**
 * Phases drive both the main content and the action footer. The footer
 * renders different buttons per phase. `input` and `ask_user` are handled
 * inline (Create / Submit are next to the input), so the footer is empty
 * for those phases.
 */
import type { LucideIcon } from "lucide-react";
import { Check, RotateCcw, RefreshCw, Plus, X, Trash2, Pencil, Save } from "lucide-react";

export type StudioPhase =
  | "input"
  | "planning"
  | "ask_user"
  | "completed"
  | "executing"
  | "executed"
  | "execute_failed";

interface ActionBarProps {
  phase: StudioPhase;
  inFlight: boolean;
  onApprove: () => void;
  onRevise: () => void;
  onCancel: () => void;
  onRollback: () => void;
  onNewPlan: () => void;
  /**
   * True while the user is manually editing the desired state. When true, the
   * "completed" buttons are replaced with Save (persist the working copy) and
   * Cancel (discard the working copy).
   */
  editing?: boolean;
  onEnterEdit?: () => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
}

export default function ActionBar({
  phase,
  inFlight,
  onApprove,
  onRevise,
  onCancel,
  onRollback,
  onNewPlan,
  editing,
  onEnterEdit,
  onSaveEdit,
  onCancelEdit,
}: ActionBarProps) {
  const buttons = buttonsForPhase(phase, inFlight, editing, {
    onApprove,
    onRevise,
    onCancel,
    onRollback,
    onNewPlan,
    onEnterEdit,
    onSaveEdit,
    onCancelEdit,
  });

  if (buttons.length === 0) return null;

  return (
    <footer className="border-t border-discord-divider bg-discord-bg-floating px-6 py-3 flex items-center gap-3 flex-wrap">
      {phaseLabel(phase, editing) && (
        <span className="text-xs text-discord-text-muted uppercase tracking-wide mr-auto">
          {phaseLabel(phase, editing)}
        </span>
      )}
      {buttons.map((b) => {
        const Icon = b.icon;
        return (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={b.disabled}
            className={`px-4 py-2 rounded text-sm transition flex items-center gap-2 ${b.className} ${
              b.disabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {Icon && <Icon size={16} />}
            {b.label}
          </button>
        );
      })}
    </footer>
  );
}

interface ButtonSpec {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  icon?: LucideIcon;
}

function buttonsForPhase(
  phase: StudioPhase,
  inFlight: boolean,
  editing: boolean | undefined,
  cbs: Pick<
    ActionBarProps,
    | "onApprove"
    | "onRevise"
    | "onCancel"
    | "onRollback"
    | "onNewPlan"
    | "onEnterEdit"
    | "onSaveEdit"
    | "onCancelEdit"
  >
): ButtonSpec[] {
  const disabledAll = inFlight;
  switch (phase) {
    case "input":
    case "ask_user":
      return [];
    case "planning":
      return [
        {
          label: "Cancel",
          onClick: cbs.onCancel,
          disabled: false,
          className: "bg-discord-red hover:bg-discord-red/80 text-white",
          icon: X,
        },
      ];
    case "completed":
      if (editing) {
        return [
          {
            label: "Save",
            onClick: cbs.onSaveEdit ?? (() => {}),
            disabled: disabledAll,
            className: "bg-discord-green hover:bg-discord-green/80 text-white",
            icon: Save,
          },
          {
            label: "Cancel",
            onClick: cbs.onCancelEdit ?? (() => {}),
            disabled: disabledAll,
            className: "bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white",
            icon: X,
          },
        ];
      }
      return [
        {
          label: "Approve & Execute",
          onClick: cbs.onApprove,
          disabled: disabledAll,
          className: "bg-discord-green hover:bg-discord-green/80 text-white",
          icon: Check,
        },
        {
          label: "Direct Edit",
          onClick: cbs.onEnterEdit ?? (() => {}),
          disabled: disabledAll,
          className: "bg-discord-yellow hover:bg-discord-yellow/80 text-discord-bg-tertiary",
          icon: Pencil,
        },
        {
          label: "Revise",
          onClick: cbs.onRevise,
          disabled: disabledAll,
          className: "bg-discord-accent hover:bg-discord-accent-hover text-white",
          icon: RefreshCw,
        },
        {
          label: "New Plan",
          onClick: cbs.onNewPlan,
          disabled: disabledAll,
          className: "bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white",
          icon: Plus,
        },
      ];
    case "executing":
      return [];
    case "executed":
      return [
        {
          label: "Rollback",
          onClick: cbs.onRollback,
          disabled: disabledAll,
          className: "bg-discord-yellow hover:bg-discord-yellow/80 text-discord-bg-tertiary",
          icon: RotateCcw,
        },
        {
          label: "New Plan",
          onClick: cbs.onNewPlan,
          disabled: disabledAll,
          className: "bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white",
          icon: Plus,
        },
      ];
    case "execute_failed":
      return [
        {
          label: "Start Over",
          onClick: cbs.onNewPlan,
          disabled: disabledAll,
          className: "bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white",
          icon: Trash2,
        },
      ];
  }
}

function phaseLabel(phase: StudioPhase, editing: boolean | undefined): string | null {
  if (editing) return "Editing…";
  switch (phase) {
    case "planning":
      return "Planning…";
    case "ask_user":
      return "Awaiting your answer";
    case "completed":
      return "Plan ready";
    case "executing":
      return "Executing…";
    case "executed":
      return "Done";
    case "execute_failed":
      return "Failed";
    case "input":
      return null;
  }
}
