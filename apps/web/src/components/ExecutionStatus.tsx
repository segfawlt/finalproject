import { useMemo } from "react";
import { Circle, Loader, Check, X } from "lucide-react";

export interface ExecEvent {
  type: string;
  stepIndex?: number;
  error?: string;
  result?: Record<string, unknown>;
}

type StepStatus = "pending" | "running" | "done" | "failed" | "retrying";

export interface ExecutionStep {
  index: number;
  status: StepStatus;
  error?: string;
}

interface ExecutionStatusProps {
  events: ExecEvent[];
  /** Optional step labels keyed by index (e.g. plan steps). */
  stepNames?: Record<number, string>;
}

/**
 * Aggregates the execution SSE event stream into one row per step and
 * renders a status badge per row. The aggregate is recomputed from `events`
 * on every render — fine for a typical plan (tens of steps).
 */
export default function ExecutionStatus({ events, stepNames }: ExecutionStatusProps) {
  const steps = useMemo(() => aggregateSteps(events), [events]);

  if (steps.length === 0) {
    return (
      <div className="text-discord-text-muted text-xs italic p-3 border border-dashed border-discord-divider rounded">
        Waiting for execution events…
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {steps.map((s) => (
        <li
          key={s.index}
          className="flex items-baseline gap-2 px-3 py-1.5 bg-discord-bg-tertiary border border-discord-divider rounded text-sm"
        >
          <StatusGlyph status={s.status} />
          <span className="text-discord-text">Step {s.index}</span>
          {stepNames?.[s.index] && (
            <span className="text-discord-text-muted text-xs font-mono">{stepNames[s.index]}</span>
          )}
          {s.error && <span className="text-discord-red text-xs ml-auto">{s.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function aggregateSteps(events: ExecEvent[]): ExecutionStep[] {
  const stepMap = new Map<number, ExecutionStep>();
  for (const ev of events) {
    if (ev.stepIndex === undefined) continue;
    let step = stepMap.get(ev.stepIndex);
    if (!step) {
      step = { index: ev.stepIndex, status: "pending" };
      stepMap.set(ev.stepIndex, step);
    }
    if (ev.type === "step_started") step.status = "running";
    if (ev.type === "step_completed") step.status = "done";
    if (ev.type === "step_failed") {
      step.status = "failed";
      step.error = ev.error;
    }
    if (ev.type === "step_retry") {
      step.status = "retrying";
      step.error = ev.error;
    }
  }
  return Array.from(stepMap.values()).sort((a, b) => a.index - b.index);
}

function StatusGlyph({ status }: { status: StepStatus }) {
  switch (status) {
    case "pending":
      return <Circle size={14} className="text-discord-text-muted inline-block" />;
    case "running":
      return <Loader size={14} className="text-discord-yellow inline-block animate-spin" />;
    case "done":
      return <Check size={14} className="text-discord-green inline-block" />;
    case "failed":
      return <X size={14} className="text-discord-red inline-block" />;
    case "retrying":
      return <Loader size={14} className="text-discord-yellow inline-block animate-spin" />;
  }
}
