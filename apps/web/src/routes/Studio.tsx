import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Bot, Library } from "lucide-react";
import TemplatePanel from "../components/TemplatePanel";
import StudioShell from "../components/studio/StudioShell";
import StudioHeader from "../components/studio/StudioHeader";
import ConversationSidebar from "../components/studio/ConversationSidebar";
import ChatArea, { type ChatAreaEditProps } from "../components/studio/ChatArea";
import RightPanel from "../components/studio/RightPanel";
import DriftIndicator from "../components/studio/DriftIndicator";
import { useGuildName } from "../hooks/useGuildName";
import { useConversation } from "../hooks/useConversation";
import { useDesiredStateEdit } from "../hooks/useDesiredStateEdit";
import { useGuildDrift } from "../hooks/useGuildDrift";
import { apiFetch } from "../lib/api";

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();
  const guildName = useGuildName(guildId);
  const c = useConversation({ guildId });
  const drift = useGuildDrift(guildId);

  // ── Guild picker (only when /studio is hit without a guildId) ──────────────
  const [availableGuilds, setAvailableGuilds] = useState<
    Array<{ id: string; name: string; icon: string | null; memberCount: number }>
  >([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

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
    // Fetch the bot invite URL so the picker can offer it when no guild is
    // operable yet (replaces the old /setup wizard's invite step).
    apiFetch("/api/bot/invite")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url?: string } | null) => setInviteUrl(data?.url ?? null))
      .catch(() => setInviteUrl(null));
  }, [guildId]);

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
      rightPanel={guildId ? <RightPanel c={c} guildId={guildId} /> : undefined}
    >
      <div className="flex-1 flex flex-col min-h-0">
        {/* Guild picker (only when no guild is picked) — replaces the
            welcome screen until the user has chosen a guild. */}
        {!guildId ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto py-8 space-y-3">
              <div className="text-sm text-shell-text font-medium">
                Select a guild to plan against
              </div>
              {guildsLoading ? (
                <div className="text-sm text-shell-text-muted">Loading guilds…</div>
              ) : availableGuilds.length === 0 ? (
                <div className="rounded-lg border border-shell-border bg-shell-surface p-5 space-y-3">
                  <div className="flex items-center gap-2 text-shell-text font-medium">
                    <Bot size={16} />
                    No guilds ready yet
                  </div>
                  <p className="text-sm text-shell-text-muted">
                    Invite the planning bot to a Discord server you administer. It needs
                    Administrator permission to create and manage channels, roles, and members.
                    Once it&apos;s in, refresh this page and your server will show up here.
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
                    <div className="text-sm text-shell-text-subtle">Loading invite link…</div>
                  )}
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
          </div>
        ) : (
          <>
            {/* Conversation toolbar (Templates toggle) */}
            {c.conversationId && (
              <div className="flex items-center justify-end px-4 py-2 border-b border-shell-border bg-shell-surface/50">
                <button
                  onClick={() => c.setShowTemplatePanel(!c.showTemplatePanel)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                    c.showTemplatePanel
                      ? "bg-shell-accent text-shell-accent-fg"
                      : "text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2"
                  }`}
                >
                  <Library size={13} />
                  Templates ({c.activeTemplates.length})
                </button>
              </div>
            )}

            {/* Template context panel */}
            {c.showTemplatePanel && c.conversationId && guildId && (
              <TemplatePanel
                guildId={guildId}
                conversationId={c.conversationId}
                active={c.activeTemplates}
                onActiveChange={c.setActiveTemplates}
              />
            )}

            <ChatArea c={c} guildId={guildId} guildName={guildName || guildId} edit={editProps} />
          </>
        )}
      </div>
      <DriftIndicator event={drift.event} onDismiss={drift.dismiss} onReFork={() => c.reset()} />
    </StudioShell>
  );
}
