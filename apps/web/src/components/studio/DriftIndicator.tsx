import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw, X } from "lucide-react";
import type { DriftEvent } from "../../hooks/useGuildDrift";

interface DriftIndicatorProps {
  event: DriftEvent | null;
  onDismiss: () => void;
  onReFork: () => void;
}

/**
 * Toast that surfaces server-side drift (channels or roles
 * changed outside the platform). Auto-dismisses after 10s, but
 * the user can also dismiss manually. The 'Re-fork' action
 * resets the conversation so the user can re-plan against the
 * current Discord state.
 */
export default function DriftIndicator({ event, onDismiss, onReFork }: DriftIndicatorProps) {
  // Auto-dismiss after 10s.
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => {
    if (!event) {
      setArmed(null);
      return;
    }
    const id = event.detectedAt ? Date.parse(event.detectedAt) : Date.now();
    setArmed(id);
    const timer = setTimeout(onDismiss, 10_000);
    return () => clearTimeout(timer);
  }, [event, onDismiss]);

  if (!event) return null;

  const severityClass = severityStyles(event.severity);
  const Icon = event.severity === "critical" ? AlertTriangle : RefreshCcw;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed top-16 right-6 z-50 max-w-sm rounded-lg border shadow-2xl shadow-black/40 bg-shell-surface ${severityClass}`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="shrink-0 mt-0.5">
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-shell-text text-xs font-semibold uppercase tracking-wider mb-0.5">
            {event.severity === "critical" ? "Server changed externally" : "Server updated"}
          </div>
          <div className="text-shell-text text-sm leading-snug">{event.summary}</div>
          {armed && (
            <div className="text-shell-text-subtle text-[10px] mt-1">
              Detected {formatTime(event.detectedAt)}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onReFork}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover rounded text-xs font-medium transition-colors"
            >
              <RefreshCcw size={11} />
              Re-fork
            </button>
            <button
              onClick={onDismiss}
              className="text-shell-text-muted hover:text-shell-text text-xs px-2 py-1 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-shell-text-muted hover:text-shell-text p-0.5 -mt-0.5"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function severityStyles(s: DriftEvent["severity"]): string {
  switch (s) {
    case "critical":
      return "border-error/50 text-error";
    case "warning":
      return "border-agent-yellow/50 text-agent-done";
    case "info":
    default:
      return "border-shell-border text-shell-text-muted";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString();
  } catch {
    return iso;
  }
}
