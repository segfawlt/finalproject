import { useState } from "react";
import {
  Check,
  CircleAlert,
  Loader,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Undo2,
  X,
} from "lucide-react";
import DesiredStateView from "../DesiredStateView";
import type { DesiredState, ChannelBase, Role } from "../desired-state/types";
import type { UseConversationResult, PlanningEvent, ExecEvent } from "../../hooks/useConversation";
import IterationHistoryModal from "./IterationHistoryModal";
import { History } from "lucide-react";

// ── Edit-mode prop bundle ─────────────────────────────────────────────────

export interface ChatAreaEditProps {
  editing: boolean;
  editableState: DesiredState | null;
  patchChannel: (id: string, next: ChannelBase) => void;
  deleteChannel: (id: string) => void;
  addChannel: () => void;
  addCategory: () => void;
  patchRole: (id: string, next: Role) => void;
  deleteRole: (id: string) => void;
  addRole: () => void;
  enterEditMode: () => void;
  saveEdit: () => void;
  cancelEdit: () => void;
}

interface ChatAreaProps {
  c: UseConversationResult;
  guildName: string;
  edit: ChatAreaEditProps;
}

// ── ChatArea ──────────────────────────────────────────────────────────────

export default function ChatArea({ c, guildName, edit }: ChatAreaProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const iterationsCount = c.iterations.length;
  const currentVersion =
    iterationsCount > 0 ? Math.max(...c.iterations.map((i) => i.version)) : null;

  // Empty state → welcome screen (handles prompt entry)
  if (!c.conversationId) {
    return (
      <WelcomeShell
        guildName={guildName}
        onPromptSelect={c.createConversation}
        disabled={c.inFlight}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat toolbar — small top bar with a History button. */}
      {iterationsCount > 0 && (
        <div className="flex items-center justify-end px-4 py-2 border-b border-shell-border bg-shell-surface/50">
          <button
            onClick={() => setHistoryOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 transition-colors"
          >
            <History size={13} />
            History ({iterationsCount})
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full p-6 space-y-4">
          {/* User prompt bubble */}
          {c.prompt && <UserBubble prompt={c.prompt} />}

          {/* Planning stream */}
          {(c.phase === "planning" || c.planningEvents.length > 0) && (
            <AssistantBubble
              accent="thinking"
              label={
                c.phase === "planning" ? "Planning…" : c.phase === "ask_user" ? "Waiting for you" : "Planned"
              }
            >
              {c.planningEvents.length === 0 ? (
                <EmptyLine text="Thinking about your request…" />
              ) : (
                <PlanningLog events={c.planningEvents} />
              )}
            </AssistantBubble>
          )}

          {/* Ask user */}
          {c.phase === "ask_user" && c.askUserData && <AskUserBubble c={c} />}

          {/* Completed: summary + desired state + iterations + actions */}
          {c.phase === "completed" && c.summary && (
            <AssistantBubble accent="done" label="Plan ready">
              <div className="text-shell-text whitespace-pre-wrap text-sm leading-relaxed">
                {c.summary}
              </div>
              {c.desiredState && (
                <div className="mt-3 rounded-lg border border-shell-border bg-shell-surface overflow-hidden">
                  <DesiredStateView
                    desiredState={edit.editing ? edit.editableState : c.desiredState}
                    currentState={edit.editing ? null : c.currentState}
                    editing={edit.editing}
                    onChannelChange={edit.patchChannel}
                    onChannelDelete={edit.deleteChannel}
                    onChannelAdd={edit.addChannel}
                    onCategoryChange={edit.patchChannel}
                    onCategoryDelete={edit.deleteChannel}
                    onCategoryAdd={edit.addCategory}
                    onRoleChange={edit.patchRole}
                    onRoleDelete={edit.deleteRole}
                    onRoleAdd={edit.addRole}
                  />
                </div>
              )}
              {!edit.editing && c.iterations.length > 0 && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-shell-text-muted hover:text-shell-text transition-colors"
                >
                  <History size={13} />
                  View iteration history
                </button>
              )}
              <ActionRow>
                {c.desiredState && !edit.editing && (
                  <ActionButton onClick={edit.enterEditMode} icon={<Pencil size={13} />}>
                    Edit
                  </ActionButton>
                )}
                {edit.editing && (
                  <>
                    <ActionButton onClick={edit.saveEdit} icon={<Save size={13} />}>
                      Save
                    </ActionButton>
                    <ActionButton onClick={edit.cancelEdit} icon={<X size={13} />}>
                      Cancel
                    </ActionButton>
                  </>
                )}
                {!edit.editing && (
                  <>
                    <ActionButton
                      onClick={c.approve}
                      disabled={c.inFlight || c.stale}
                      title={c.stale ? "Server changed since planning. Re-fork to update." : undefined}
                      primary
                      icon={<Check size={13} />}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton onClick={c.cancelPlanning} disabled={c.inFlight}>
                      Cancel
                    </ActionButton>
                  </>
                )}
              </ActionRow>
            </AssistantBubble>
          )}

          {/* Executing */}
          {(c.phase === "executing" || (c.phase === "executed" && c.execEvents.length > 0)) && (
            <AssistantBubble accent="editing" label={c.phase === "executing" ? "Executing…" : "Execution complete"}>
              <ExecutionLog events={c.execEvents} />
              {c.phase === "executed" && (
                <ActionRow>
                  <ActionButton onClick={c.rollback} icon={<Undo2 size={13} />}>
                    Rollback
                  </ActionButton>
                  <ActionButton onClick={c.reset} icon={<RotateCcw size={13} />}>
                    New plan
                  </ActionButton>
                </ActionRow>
              )}
            </AssistantBubble>
          )}

          {/* Execute failed */}
          {c.phase === "execute_failed" && (
            <AssistantBubble accent="error" label="Execution failed">
              <div className="text-shell-text text-sm">{c.error}</div>
              <ActionRow>
                <ActionButton onClick={c.reset} icon={<RotateCcw size={13} />}>
                  Start over
                </ActionButton>
              </ActionRow>
            </AssistantBubble>
          )}

          {/* Generic error banner (for non-fatal errors during planning) */}
          {c.error &&
            c.phase !== "execute_failed" &&
            c.phase !== "completed" && <ErrorBanner error={c.error} />}
        </div>
      </div>

      {/* Revise input — only after the plan is ready */}
      {c.phase === "completed" && !edit.editing && (
        <ReviseInput
          value={c.prompt}
          onChange={c.setPrompt}
          onSubmit={() => c.revise(c.prompt)}
          inFlight={c.inFlight}
        />
      )}

      <IterationHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        iterations={c.iterations}
        currentVersion={currentVersion}
        onRevert={c.revert}
      />
    </div>
  );
}

// ── Welcome shell (re-uses WelcomeScreen's empty state when no convo) ────

import WelcomeScreen from "./WelcomeScreen";

function WelcomeShell({
  guildName,
  onPromptSelect,
  disabled,
}: {
  guildName: string;
  onPromptSelect: (p: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <WelcomeScreen
        guildName={guildName}
        onPromptSelect={onPromptSelect}
        disabled={disabled}
      />
    </div>
  );
}

// ── Bubble components ────────────────────────────────────────────────────

function UserBubble({ prompt }: { prompt: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-shell-accent text-shell-accent-fg px-4 py-2.5 text-sm whitespace-pre-wrap">
        {prompt}
      </div>
    </div>
  );
}

function AssistantBubble({
  accent,
  label,
  children,
}: {
  accent: "thinking" | "reading" | "editing" | "asking" | "done" | "error";
  label: string;
  children: React.ReactNode;
}) {
  const accentClass = `border-l-agent-${accent}`;
  return (
    <div className="flex">
      <div
        className={`max-w-[90%] rounded-2xl rounded-bl-md border border-shell-border bg-shell-surface px-4 py-3 border-l-2 ${accentClass}`}
      >
        <div className="text-[10px] uppercase tracking-wider text-shell-text-muted font-semibold mb-1.5">
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

function AskUserBubble({ c }: { c: UseConversationResult }) {
  const data = c.askUserData!;
  return (
    <AssistantBubble accent="asking" label="Question">
      <div className="text-shell-text text-sm leading-relaxed">{data.question}</div>
      {data.options && data.options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.options.map((opt) => {
            const selected = data.multiSelect
              ? c.askUserSelected.includes(opt.label)
              : c.askUserSelected[0] === opt.label;
            return (
              <button
                key={opt.label}
                onClick={() => {
                  if (data.multiSelect) {
                    c.setAskUserSelected((prev) =>
                      prev.includes(opt.label)
                        ? prev.filter((l) => l !== opt.label)
                        : [...prev, opt.label]
                    );
                  } else {
                    c.setAskUserSelected([opt.label]);
                  }
                }}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-colors ${
                  selected
                    ? "bg-shell-accent text-shell-accent-fg"
                    : "bg-shell-surface2 text-shell-text hover:bg-shell-surface3 border border-shell-border"
                }`}
              >
                {selected && data.multiSelect ? <Check size={11} /> : null}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      {(!data.options || data.options.length === 0 || data.allowCustom) && (
        <input
          value={c.askUserCustom}
          onChange={(e) => c.setAskUserCustom(e.target.value)}
          placeholder={
            data.options && data.options.length > 0
              ? "Or type a custom answer…"
              : "Your answer…"
          }
          className="mt-2 w-full px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none"
        />
      )}
      <ActionRow>
        <ActionButton
          onClick={c.submitAskUser}
          disabled={c.askUserSelected.length === 0 && !c.askUserCustom.trim()}
          primary
          icon={<Send size={13} />}
        >
          Submit
        </ActionButton>
      </ActionRow>
    </AssistantBubble>
  );
}

// ── Logs ────────────────────────────────────────────────────────────────

function PlanningLog({ events }: { events: PlanningEvent[] }) {
  return (
    <details className="group">
      <summary className="text-shell-text-muted text-xs cursor-pointer hover:text-shell-text select-none">
        {events.length} planning event{events.length === 1 ? "" : "s"}
      </summary>
      <div className="mt-2 max-h-48 overflow-y-auto rounded-md bg-shell-surface2 border border-shell-border p-2 font-mono text-[11px] space-y-0.5">
        {events.map((ev, i) => (
          <div key={i} className="text-shell-text-muted">
            {ev.type === "turn_started" && <span className="text-agent-thinking">→ turn started</span>}
            {ev.type === "tool_called" && <span>→ {ev.toolName ?? "tool"}</span>}
            {ev.type === "tool_result" && (
              <span className="text-shell-text-subtle">← {ev.toolName ?? "tool"} ok</span>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function ExecutionLog({ events }: { events: ExecEvent[] }) {
  if (events.length === 0) {
    return <EmptyLine text="Starting execution…" />;
  }
  return (
    <details className="group" open>
      <summary className="text-shell-text-muted text-xs cursor-pointer hover:text-shell-text select-none">
        {events.length} step event{events.length === 1 ? "" : "s"}
      </summary>
      <ol className="mt-2 space-y-1">
        {events.map((ev, i) => (
          <li key={i} className="text-xs flex items-center gap-2">
            <StepBadge type={ev.type} />
            <span className="text-shell-text-muted">
              {ev.type === "step_started" && "Step started"}
              {ev.type === "step_completed" && "Step completed"}
              {ev.type === "step_failed" && (
                <span className="text-error">Step failed{ev.error ? `: ${ev.error}` : ""}</span>
              )}
              {ev.type === "step_retry" && (
                <span className="text-shell-yellow">Retrying{ev.error ? `: ${ev.error}` : ""}</span>
              )}
              {ev.type === "rollback_started" && "Rolling back…"}
              {ev.type === "rollback_completed" && "Rollback complete"}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function StepBadge({ type }: { type: ExecEvent["type"] }) {
  const map: Record<ExecEvent["type"], { char: string; cls: string }> = {
    step_started: { char: "●", cls: "text-agent-thinking" },
    step_completed: { char: "✓", cls: "text-agent-done" },
    step_failed: { char: "✕", cls: "text-error" },
    step_retry: { char: "↻", cls: "text-shell-yellow" },
    rollback_started: { char: "↶", cls: "text-shell-text-muted" },
    rollback_completed: { char: "↺", cls: "text-shell-text-muted" },
  };
  const m = map[type];
  return <span className={m ? `${m.cls} w-3 text-center` : ""}>{m?.char}</span>;
}

// ── Inputs / actions ────────────────────────────────────────────────────

function ReviseInput({
  value,
  onChange,
  onSubmit,
  inFlight,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inFlight: boolean;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="border-t border-shell-border bg-shell-surface px-4 py-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || inFlight) return;
          onChange(draft);
          onSubmit();
        }}
        className="max-w-3xl mx-auto flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Ask for a revision…"
          className="flex-1 px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none resize-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || inFlight}
          className="inline-flex items-center gap-1 px-3 py-2 bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
        >
          {inFlight ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          Revise
        </button>
      </form>
    </div>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>;
}

function ActionButton({
  onClick,
  disabled,
  primary,
  icon,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        primary
          ? "bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover"
          : "bg-shell-surface2 text-shell-text border border-shell-border hover:border-shell-border-strong"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="text-shell-text-muted text-xs flex items-center gap-2">
      <Loader size={12} className="animate-spin" />
      {text}
    </div>
  );
}

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-error/30 bg-error/5 px-4 py-3 flex items-start gap-2">
        <CircleAlert size={14} className="text-error shrink-0 mt-0.5" />
        <div className="text-error text-sm">{error}</div>
      </div>
    </div>
  );
}
