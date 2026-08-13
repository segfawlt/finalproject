import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowUpRight, Bot, RefreshCw } from "lucide-react";
import TemplatePanel from "../components/TemplatePanel";
import StudioShell from "../components/studio/StudioShell";
import StudioHeader from "../components/studio/StudioHeader";
import WorkspaceSidebar from "../components/studio/WorkspaceSidebar";
import ChatArea, { type ChatAreaEditProps } from "../components/studio/ChatArea";
import RightPanel from "../components/studio/RightPanel";
import DriftIndicator from "../components/studio/DriftIndicator";
import IterationHistoryModal from "../components/studio/IterationHistoryModal";
import SettingsDialog from "../components/studio/SettingsDialog";
import { useGuildName } from "../hooks/useGuildName";
import { useConversation } from "../hooks/useConversation";
import { useDesiredStateEdit } from "../hooks/useDesiredStateEdit";
import { useGuildDrift } from "../hooks/useGuildDrift";
import { apiFetch } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { useStudioStore } from "../stores/studioStore";

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();
  const guildName = useGuildName(guildId);
  const c = useConversation({ guildId });
  const drift = useGuildDrift(guildId);
  const [historyOpen, setHistoryOpen] = useState(false);

  // ── Guild picker (only when /studio is hit without a guildId) ──────────────
  const [availableGuilds, setAvailableGuilds] = useState<
    Array<{
      id: string;
      name: string;
      icon: string | null;
      memberCount: number;
      latestConversation: { prompt: string; updatedAt: string } | null;
    }>
  >([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [guildsError, setGuildsError] = useState<string | null>(null);
  const [selectingGuildId, setSelectingGuildId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const setSelectedGuild = useStudioStore((state) => state.setSelectedGuild);
  const pickerRequestId = useRef(0);

  useEffect(() => {
    setSelectedGuild(guildId ?? null);
  }, [guildId, setSelectedGuild]);

  const loadGuildPicker = useCallback(() => {
    if (guildId) return Promise.resolve();
    const requestId = ++pickerRequestId.current;
    const isActiveRequest = () => pickerRequestId.current === requestId;
    setGuildsLoading(true);
    setGuildsError(null);
    apiFetch("/api/guilds")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load guilds (${res.status})`);
        return res.json();
      })
      .then(
        (
          data: Array<{
            id: string;
            name: string;
            icon: string | null;
            memberCount: number;
            latestConversation: { prompt: string; updatedAt: string } | null;
          }>
        ) => {
          if (isActiveRequest()) setAvailableGuilds(data);
        }
      )
      .catch((err: unknown) => {
        if (isActiveRequest()) {
          setAvailableGuilds([]);
          setGuildsError(err instanceof Error ? err.message : "Failed to load guilds");
        }
      })
      .finally(() => {
        if (isActiveRequest()) setGuildsLoading(false);
      });
    // Fetch the bot invite URL so the picker can offer it when no guild is
    // operable yet (replaces the old /setup wizard's invite step).
    apiFetch("/api/bot/invite")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url?: string } | null) => {
        if (isActiveRequest()) setInviteUrl(data?.url ?? null);
      })
      .catch(() => {
        if (isActiveRequest()) setInviteUrl(null);
      });
  }, [guildId]);

  useEffect(() => {
    void loadGuildPicker();
    return () => {
      pickerRequestId.current += 1;
    };
  }, [loadGuildPicker]);

  // ── Manual edit mode (working copy of desired state) ──────────────────────
  const edit = useDesiredStateEdit();

  function enterEditMode() {
    if (!c.desiredState) return;
    edit.beginEdit(c.desiredState);
  }

  async function saveEdit() {
    if (!c.conversationId || !guildId || !edit.editableState) return;
    if (c.inFlight) return;
    c.clearError();
    try {
      const res = await apiFetch(
        `/api/guilds/${guildId}/conversations/${c.conversationId}/edit-state`,
        { method: "POST", body: { desiredState: edit.editableState } }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        c.setError(data.error || "Failed to save edit");
        return;
      }
      edit.finishEdit();
      // Refresh the conversation so the manual_edit iteration shows up.
      if (c.conversationId) await c.loadConversation(c.conversationId);
    } catch (err) {
      c.setError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const editProps: ChatAreaEditProps = {
    editing: edit.editing,
    editableState: edit.editableState,
    patchChannel: edit.patchChannel,
    deleteChannel: edit.deleteChannel,
    addChannel: edit.addChannel,
    addCategory: edit.addCategory,
    patchRole: edit.patchRole,
    deleteRole: edit.deleteRole,
    addRole: edit.addRole,
    enterEditMode,
    saveEdit,
    cancelEdit: edit.cancelEdit,
  };

  if (!guildId) {
    return (
      <main className="studio-guild-picker-page">
        <div className="studio-guild-picker-content">
          <div className="studio-guild-picker-account">Logged in as {user?.name || "User"}</div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-shell-text">Select a server</h1>
              <p className="mt-1 text-sm text-shell-text-muted">
                Choose a Discord server to open in Studio.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadGuildPicker()}
              disabled={guildsLoading}
              aria-label="Refresh guilds"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-shell-text-muted transition-colors hover:bg-shell-surface2 hover:text-shell-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={13} className={guildsLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {guildsLoading ? (
            <div role="status" aria-live="polite" className="text-sm text-shell-text-muted">
              Loading guilds…
            </div>
          ) : guildsError ? (
            <div
              role="alert"
              className="rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error"
            >
              {guildsError}
            </div>
          ) : availableGuilds.length === 0 ? (
            <div className="rounded-lg border border-shell-border bg-shell-surface p-5 space-y-3">
              <div className="flex items-center gap-2 text-shell-text font-medium">
                <Bot size={16} />
                No guilds ready yet
              </div>
              <p className="text-sm text-shell-text-muted">
                Invite the planning bot to a Discord server you administer. It needs Administrator
                permission to create and manage channels, roles, and members. Once it&apos;s in,
                refresh this page and your server will show up here.
              </p>
              {inviteUrl ? (
                <a
                  href={inviteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover text-sm font-medium transition-colors"
                >
                  <Bot size={14} /> Invite the bot
                </a>
              ) : (
                <div role="status" aria-live="polite" className="text-sm text-shell-text-subtle">
                  Loading invite link…
                </div>
              )}
            </div>
          ) : (
            <div className="studio-guild-picker-list">
              {availableGuilds.map((g) => (
                <a
                  key={g.id}
                  href={`/studio/${g.id}`}
                  onClick={() => setSelectingGuildId(g.id)}
                  aria-busy={selectingGuildId === g.id}
                  data-state={selectingGuildId === g.id ? "selecting" : "idle"}
                  className="studio-guild-picker-row"
                >
                  {g.icon ? (
                    <img src={g.icon} alt="" className="studio-guild-picker-icon" />
                  ) : (
                    <span className="studio-guild-picker-icon flex items-center justify-center bg-shell-surface3 text-xs font-semibold">
                      {g.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{g.name}</span>
                    {g.latestConversation && (
                      <span className="block truncate">{g.latestConversation.prompt}</span>
                    )}
                    <span className="block truncate text-xs text-shell-text-muted">
                      {g.memberCount} members
                    </span>
                    {g.latestConversation && (
                      <span className="block truncate text-xs text-shell-text-muted">
                        Last conversation at:{" "}
                        {new Date(g.latestConversation.updatedAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </span>
                  <ArrowUpRight
                    size={16}
                    aria-hidden="true"
                    className="studio-guild-picker-arrow"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <StudioShell
      header={
        <StudioHeader
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHistory={() => setHistoryOpen(true)}
          historyCount={c.iterations.length}
        />
      }
      sidebar={
        <WorkspaceSidebar
          guildId={guildId ?? null}
          guildName={guildName}
          activeConversationId={c.conversationId}
          onSelectConversation={c.loadConversation}
          onNewChat={guildId ? c.reset : undefined}
        />
      }
      rightPanel={guildId ? <RightPanel c={c} guildId={guildId} /> : undefined}
    >
      <div className="flex-1 flex flex-col min-h-0">
        <>
          {/* Template context panel */}
          {c.showTemplatePanel && c.conversationId && guildId && (
            <TemplatePanel
              guildId={guildId}
              conversationId={c.conversationId}
              active={c.activeTemplates}
              onActiveChange={c.setActiveTemplates}
            />
          )}

          <ChatArea
            c={c}
            guildId={guildId}
            edit={editProps}
            onOpenHistory={() => setHistoryOpen(true)}
          />
        </>
      </div>
      <DriftIndicator event={drift.event} onDismiss={drift.dismiss} onReFork={() => c.reset()} />
      <IterationHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        iterations={c.iterations}
        currentVersion={
          c.iterations.length > 0 ? Math.max(...c.iterations.map((i) => i.version)) : null
        }
        onRevert={c.revert}
      />
      {guildId && (
        <SettingsDialog
          guildId={guildId}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onModelsSaved={c.updateDeploymentModels}
        />
      )}
    </StudioShell>
  );
}
