import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, CircleAlert, LayoutGrid, Loader } from "lucide-react";
import DesiredStateView from "../components/DesiredStateView";
import type { ChannelBase, DesiredState, Role } from "../components/desired-state";
import ActionBar from "../components/ActionBar";
import ExecutionStatus, { type ExecEvent } from "../components/ExecutionStatus";
import IterationHistory from "../components/IterationHistory";
import TemplatePanel from "../components/TemplatePanel";
import StudioShell from "../components/studio/StudioShell";
import StudioHeader from "../components/studio/StudioHeader";
import ConversationSidebar from "../components/studio/ConversationSidebar";
import WelcomeScreen from "../components/studio/WelcomeScreen";
import { useGuildName } from "../hooks/useGuildName";
import { useConversation, type PlanningEvent } from "../hooks/useConversation";
import { apiFetch } from "../lib/api";

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();
  const guildName = useGuildName(guildId);
  const c = useConversation({ guildId });

  // ── Guild picker (only when /studio is hit without a guildId) ──────────────
  const [availableGuilds, setAvailableGuilds] = useState<
    Array<{ id: string; name: string; icon: string | null; memberCount: number }>
  >([]);
  const [guildsLoading, setGuildsLoading] = useState(false);

  useEffect(() => {
    if (guildId) return;
    setGuildsLoading(true);
    apiFetch("/api/guilds")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{ id: string; name: string; icon: string | null; memberCount: number }>) => {
          setAvailableGuilds(data);
        }
      )
      .catch(() => setAvailableGuilds([]))
      .finally(() => setGuildsLoading(false));
  }, [guildId]);

  // ── Manual edit mode (working copy of desired state) ──────────────────────
  const [editing, setEditing] = useState(false);
  const [editableState, setEditableState] = useState<DesiredState | null>(null);

  function enterEditMode() {
    if (!c.desiredState) return;
    setEditableState(structuredClone(c.desiredState));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditableState(null);
  }

  async function saveEdit() {
    if (!c.conversationId || !guildId || !editableState) return;
    if (c.inFlight) return;
    c.clearError();
    try {
      const res = await apiFetch(
        `/api/guilds/${guildId}/conversations/${c.conversationId}/edit-state`,
        { method: "POST", body: { desiredState: editableState } }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        c.setError(data.error || "Failed to save edit");
        return;
      }
      setEditing(false);
      setEditableState(null);
      // Refresh the conversation so the manual_edit iteration shows up.
      if (c.conversationId) await c.loadConversation(c.conversationId);
    } catch (err) {
      c.setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Helpers that splice changes into the working-copy DesiredState. Items are
  // keyed by their id (real Discord id or `$ch_$N` symbol), so the parent map
  // is rebuilt with the touched entry replaced in place.
  function patchChannel(id: string, next: ChannelBase) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        active: { ...prev.active, channels: { ...prev.active.channels, [id]: next } },
      };
    });
  }
  function patchRole(id: string, next: Role) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return { ...prev, active: { ...prev.active, roles: { ...prev.active.roles, [id]: next } } };
    });
  }
  function deleteChannel(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.channels[id];
      if (!existing) return prev;
      const { [id]: _removed, ...rest } = prev.active.channels;
      return {
        ...prev,
        active: { ...prev.active, channels: rest },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: existing.type === 4 ? ("category" as const) : ("channel" as const),
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }
  function deleteRole(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.roles[id];
      if (!existing) return prev;
      const { [id]: _removed, ...rest } = prev.active.roles;
      return {
        ...prev,
        active: { ...prev.active, roles: rest },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: "role" as const,
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }
  function addChannel() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"ch"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-channel",
              type: 0,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }
  function addCategory() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"cat"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-category",
              type: 4,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }
  function addRole() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"role"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          roles: {
            ...prev.active.roles,
            [id]: {
              id,
              name: "new-role",
              position: Object.values(prev.active.roles).length,
              permissions: [],
              color: 0,
              hoist: false,
              mentionable: false,
            },
          },
        },
      };
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <StudioShell
      header={<StudioHeader />}
      sidebar={
        guildId ? (
          <ConversationSidebar
            guildId={guildId}
            activeConversationId={c.conversationId}
            onSelectConversation={c.loadConversation}
            onNewChat={c.reset}
          />
        ) : undefined
      }
    >
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-shell-surface border border-shell-border flex items-center justify-center shrink-0">
              <LayoutGrid size={18} className="text-shell-text-muted" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-shell-text-muted font-semibold">
                Studio
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-shell-text truncate">
                {guildId ? guildName || `Guild ${guildId}` : "Server Configuration"}
              </h1>
            </div>
          </div>
          {c.conversationId && (
            <button
              onClick={() => c.setShowTemplatePanel(!c.showTemplatePanel)}
              className="px-4 py-2 bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover rounded text-sm transition-colors"
            >
              Templates ({c.activeTemplates.length})
            </button>
          )}
        </div>

        {/* Template context panel */}
        {c.showTemplatePanel && c.conversationId && guildId && (
          <TemplatePanel
            guildId={guildId}
            conversationId={c.conversationId}
            active={c.activeTemplates}
            onActiveChange={c.setActiveTemplates}
          />
        )}

        {/* Phase 1: Input — guild picker (no guild) or welcome (guild picked) */}
        {c.phase === "input" && (
          <>
            {!guildId && (
              <div className="max-w-2xl mx-auto py-8 space-y-3">
                <div className="text-sm text-shell-text font-medium">
                  Select a guild to plan against
                </div>
                {guildsLoading ? (
                  <div className="text-sm text-shell-text-muted">Loading guilds…</div>
                ) : availableGuilds.length === 0 ? (
                  <div className="text-sm text-shell-text-muted">
                    No guilds available. Make sure the bot is invited to a guild you admin.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {availableGuilds.map((g) => (
                      <a
                        key={g.id}
                        href={`/studio/${g.id}`}
                        className="px-3 py-2 rounded bg-shell-surface hover:bg-shell-surface2 text-shell-text text-sm flex items-center gap-2 border border-shell-border hover:border-shell-border-strong transition"
                      >
                        <span className="truncate">{g.name}</span>
                        <span className="text-xs text-shell-text-muted ml-auto">
                          {g.memberCount} members
                        </span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
            {guildId && (
              <WelcomeScreen
                guildName={guildName || guildId}
                onPromptSelect={c.createConversation}
                disabled={c.inFlight}
              />
            )}
          </>
        )}

        {/* Phase 2: Planning in progress */}
        {c.phase === "planning" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-agent-thinking">
              <Loader size={14} className="animate-spin" />
              Planning in progress...
            </div>
            <div className="bg-shell-surface rounded p-4 max-h-64 overflow-auto font-mono text-xs space-y-1 border border-shell-border">
              {c.planningEvents.map((ev, i) => (
                <div key={i} className="text-shell-text">
                  {ev.type === "turn_started" && (
                    <span className="text-agent-thinking">→ Turn started</span>
                  )}
                  {ev.type === "tool_called" && (
                    <span className="text-shell-text-muted">→ Tool: {(ev as PlanningEvent).toolName}</span>
                  )}
                  {ev.type === "tool_result" && (
                    <span className="text-shell-text-subtle">
                      ← Result: {JSON.stringify((ev as PlanningEvent).result)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 3: Ask user */}
        {c.phase === "ask_user" && c.askUserData && (
          <div className="space-y-4 max-w-2xl p-6 bg-shell-surface rounded-lg border border-shell-border">
            <div className="text-lg text-shell-text font-medium">{c.askUserData.question}</div>
            {c.askUserData.options && c.askUserData.options.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {c.askUserData.options.map((opt) => {
                  const selected = c.askUserData!.multiSelect
                    ? c.askUserSelected.includes(opt.label)
                    : c.askUserSelected[0] === opt.label;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => {
                        if (c.askUserData!.multiSelect) {
                          c.setAskUserSelected((prev) =>
                            prev.includes(opt.label)
                              ? prev.filter((l) => l !== opt.label)
                              : [...prev, opt.label]
                          );
                        } else {
                          c.setAskUserSelected([opt.label]);
                        }
                      }}
                      className={`px-4 py-2 rounded transition flex items-center gap-1 ${
                        selected
                          ? "bg-shell-accent text-shell-accent-fg"
                          : "bg-shell-surface2 text-shell-text hover:bg-shell-surface3"
                      }`}
                    >
                      {selected && c.askUserData!.multiSelect ? <Check size={14} /> : null}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
            {(!c.askUserData.options ||
              c.askUserData.options.length === 0 ||
              c.askUserData.allowCustom) && (
              <input
                value={c.askUserCustom}
                onChange={(e) => c.setAskUserCustom(e.target.value)}
                className="w-full p-3 rounded bg-shell-surface2 text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none"
                placeholder={
                  c.askUserData.options && c.askUserData.options.length > 0
                    ? "Or type a custom answer..."
                    : "Your answer..."
                }
              />
            )}
            <button
              onClick={c.submitAskUser}
              disabled={c.askUserSelected.length === 0 && !c.askUserCustom.trim()}
              className="px-6 py-2 bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover disabled:bg-shell-surface2 disabled:text-shell-text-muted rounded transition-colors"
            >
              Submit Answer
            </button>
          </div>
        )}

        {/* Phase 4: Completed → Approve / Revise / Edit */}
        {c.phase === "completed" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 text-agent-done text-lg font-medium">
              <Check size={18} />
              Planning complete!
            </div>
            {c.summary && !editing && <div className="text-shell-text">{c.summary}</div>}
            <DesiredStateView
              desiredState={editing ? editableState : c.desiredState}
              currentState={editing ? null : c.currentState}
              editing={editing}
              onChannelChange={patchChannel}
              onChannelDelete={deleteChannel}
              onChannelAdd={addChannel}
              onCategoryChange={patchChannel}
              onCategoryDelete={deleteChannel}
              onCategoryAdd={addCategory}
              onRoleChange={patchRole}
              onRoleDelete={deleteRole}
              onRoleAdd={addRole}
            />
            {!editing && (
              <>
                <IterationHistory
                  iterations={c.iterations}
                  currentVersion={
                    c.iterations.length > 0
                      ? Math.max(...c.iterations.map((i) => i.version))
                      : null
                  }
                  canRevert
                  onRevert={c.revert}
                />
                <textarea
                  value={c.prompt}
                  onChange={(e) => c.setPrompt(e.target.value)}
                  placeholder="Enter a revision prompt (optional)..."
                  className="w-full p-3 rounded bg-shell-surface text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none text-sm"
                  rows={2}
                />
              </>
            )}
          </div>
        )}

        {/* Phase 5: Executing */}
        {c.phase === "executing" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-agent-editing">
              <Loader size={14} className="animate-spin" />
              Executing plan...
            </div>
            <ExecutionStatus events={c.execEvents as ExecEvent[]} />
          </div>
        )}

        {/* Phase 6: Executed — footer (ActionBar) provides Rollback / New Plan */}
        {c.phase === "executed" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 text-agent-done text-lg font-medium">
              <Check size={18} />
              Execution complete!
            </div>
            <ExecutionStatus events={c.execEvents as ExecEvent[]} />
          </div>
        )}

        {/* Phase 6b: Execution failed */}
        {c.phase === "execute_failed" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 text-error text-lg font-medium">
              <CircleAlert size={18} />
              Execution failed
            </div>
            {c.error && <div className="text-shell-text">{c.error}</div>}
          </div>
        )}

        {/* Error banner */}
        {c.error && (
          <div className="mt-6 p-4 bg-error/10 border border-error/30 rounded text-error max-w-2xl">
            {c.error}
          </div>
        )}
      </div>
      <ActionBar
        phase={c.phase}
        inFlight={c.inFlight}
        onApprove={c.approve}
        onRevise={() => c.revise(c.prompt)}
        onCancel={c.cancelPlanning}
        onRollback={c.rollback}
        onNewPlan={c.reset}
        editing={editing}
        onEnterEdit={enterEditMode}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
      />
    </StudioShell>
  );
}
