import { useState } from "react";
import {
  Check,
  CircleAlert,
  History,
  Library,
  Loader,
  Pencil,
  RotateCcw,
  Save,
  Send,
  Square,
  Undo2,
  X,
} from "lucide-react";
import SaveTemplateModal from "./SaveTemplateModal";
import DesiredStateView from "../DesiredStateView";
import type { DesiredState, ChannelBase, Role } from "../desired-state/types";
import type { UseConversationResult, PlanningEvent, ExecEvent } from "../../hooks/useConversation";
import SharedComposer from "./SharedComposer";

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
  guildId: string;
  edit: ChatAreaEditProps;
  onOpenHistory: () => void;
}

export const DESIRED_STATE_CARD_CLASS =
  "mt-3 rounded-lg border border-shell-border bg-shell-surface p-4 overflow-hidden";

// ── ChatArea ──────────────────────────────────────────────────────────────

export default function ChatArea({ c, guildId, edit, onOpenHistory }: ChatAreaProps) {
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  // Empty state uses the same docked composer as an ongoing conversation.
  if (!c.conversationId) {
    return <FreshChat onSubmit={c.createConversation} c={c} />;
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-8 py-10 pb-40 space-y-6">
          {/* User prompt bubble */}
          {c.prompt && <UserBubble prompt={c.prompt} />}

          {/* Planning stream */}
          {(c.phase === "planning" || c.planningEvents.length > 0) && (
            <AssistantBubble
              accent="thinking"
              label={
                c.phase === "planning"
                  ? "Planning…"
                  : c.phase === "ask_user"
                    ? "Waiting for you"
                    : "Planned"
              }
            >
              {c.planningEvents.length === 0 ? (
                <EmptyLine text="Thinking about your request…" />
              ) : (
                <PlanningLog events={c.planningEvents} />
              )}
              {(c.phase === "planning" || c.phase === "ask_user") && (
                <ActionRow>
                  <ActionButton onClick={c.cancelPlanning} disabled={c.inFlight}>
                    Cancel planning
                  </ActionButton>
                </ActionRow>
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
                <div className={DESIRED_STATE_CARD_CLASS}>
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
                  onClick={onOpenHistory}
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
                      title={
                        c.stale ? "Server changed since planning. Re-fork to update." : undefined
                      }
                      primary
                      icon={<Check size={13} />}
                    >
                      Approve
                    </ActionButton>
                    {c.desiredState && (
                      <ActionButton
                        onClick={() => setSaveTemplateOpen(true)}
                        icon={<Library size={13} />}
                      >
                        Save as template
                      </ActionButton>
                    )}
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
            <AssistantBubble
              accent="editing"
              label={c.phase === "executing" ? "Executing…" : "Execution complete"}
            >
              <ExecutionLog events={c.execEvents} />
              {c.phase === "executing" && (
                <ActionRow>
                  <ActionButton onClick={c.abortExecution} icon={<Square size={12} />}>
                    Abort execution
                  </ActionButton>
                </ActionRow>
              )}
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
                {c.canAIRepair && (
                  <ActionButton onClick={c.replanWithAI} icon={<RotateCcw size={13} />}>
                    Re-plan with AI
                  </ActionButton>
                )}
                <ActionButton onClick={c.reset} icon={<RotateCcw size={13} />}>
                  Start over
                </ActionButton>
              </ActionRow>
            </AssistantBubble>
          )}

          {/* Generic error banner (for non-fatal errors during planning) */}
          {c.error && c.phase !== "execute_failed" && c.phase !== "completed" && (
            <ErrorBanner error={c.error} />
          )}
        </div>
      </div>

      {/* Revise input — only after the plan is ready */}
      {(c.phase === "completed" || c.phase === "planning" || c.phase === "ask_user") &&
        !edit.editing && (
          <SharedComposer
            value={c.prompt}
            onChange={c.setPrompt}
            placeholder="Ask for a revision…"
            submitLabel="Revise"
            onSubmit={(prompt) => c.revise(prompt)}
            inFlight={c.inFlight}
            models={c.models}
            modelConfig={c.modelConfig}
            modelsLoading={c.modelsLoading}
            onModelChange={c.updateModelConfig}
            active={c.phase === "planning" || c.phase === "ask_user"}
          />
        )}

      {c.desiredState && (
        <SaveTemplateModal
          open={saveTemplateOpen}
          onClose={() => setSaveTemplateOpen(false)}
          desiredState={c.desiredState}
        />
      )}
    </div>
  );
}

function FreshChat({
  c,
  onSubmit,
}: {
  c: UseConversationResult;
  onSubmit: (prompt?: string) => Promise<void>;
}) {
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-32 text-center">
        <h1 className="text-3xl font-light tracking-[-0.03em] text-shell-text">{timeGreeting()}</h1>
        <p className="mt-2 text-sm text-shell-text-subtle">What would you like to plan?</p>
      </div>
      <SharedComposer
        placeholder="What should we change?"
        submitLabel="Plan"
        onSubmit={onSubmit}
        inFlight={c.inFlight}
        models={c.models}
        modelConfig={c.modelConfig}
        modelsLoading={c.modelsLoading}
        onModelChange={c.updateModelConfig}
        active={c.phase === "planning" || c.phase === "ask_user"}
      />
    </div>
  );
}

export function timeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ── Bubble components ────────────────────────────────────────────────────

function UserBubble({ prompt }: { prompt: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-shell-accent text-shell-accent-fg px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-[0_8px_24px_rgba(255,255,255,0.06)]">
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
        className={`max-w-[90%] rounded-2xl rounded-bl-md border border-shell-border bg-shell-surface px-5 py-4 border-l-2 shadow-[0_10px_30px_rgba(0,0,0,0.14)] ${accentClass}`}
      >
        <div className="text-xs text-shell-text-muted font-semibold mb-1.5">{label}</div>
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
            data.options && data.options.length > 0 ? "Or type a custom answer…" : "Your answer…"
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
            {ev.type === "turn_started" && (
              <span className="text-agent-thinking">→ turn started</span>
            )}
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
                <span className="text-warning">Retrying{ev.error ? `: ${ev.error}` : ""}</span>
              )}
              {ev.type === "rollback_started" && "Rolling back…"}
              {ev.type === "rollback_completed" && "Rollback complete"}
              {ev.type === "rollback_failed" && (
                <span className="text-error">Rollback failed{ev.error ? `: ${ev.error}` : ""}</span>
              )}
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
    step_retry: { char: "↻", cls: "text-warning" },
    rollback_started: { char: "↶", cls: "text-shell-text-muted" },
    rollback_completed: { char: "↺", cls: "text-shell-text-muted" },
    rollback_failed: { char: "⚠", cls: "text-error" },
  };
  const m = map[type];
  return <span className={m ? `${m.cls} w-3 text-center` : ""}>{m?.char}</span>;
}

// ── Inputs / actions ────────────────────────────────────────────────────

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
