import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Library } from "lucide-react";
import type { ChannelBase, DesiredState, Role } from "../components/desired-state";
import TemplatePanel from "../components/TemplatePanel";
import StudioShell from "../components/studio/StudioShell";
import StudioHeader from "../components/studio/StudioHeader";
import ConversationSidebar from "../components/studio/ConversationSidebar";
import ChatArea, { type ChatAreaEditProps } from "../components/studio/ChatArea";
import { useGuildName } from "../hooks/useGuildName";
import { useConversation } from "../hooks/useConversation";
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
  const editProps: ChatAreaEditProps = {
    editing,
    editableState,
    patchChannel,
    deleteChannel,
    addChannel,
    addCategory,
    patchRole,
    deleteRole,
    addRole,
    enterEditMode,
    saveEdit,
    cancelEdit,
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

            <ChatArea c={c} guildName={guildName || guildId} edit={editProps} />
          </>
        )}
      </div>
    </StudioShell>
  );
}
