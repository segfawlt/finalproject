import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileText, LayoutGrid, Loader, LogOut, MessageSquarePlus } from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { groupConversationsByDate, type ConversationRow } from "../../lib/group-conversations";
import { useAuthStore } from "../../stores/authStore";
import { useStudioStore } from "../../stores/studioStore";

export interface WorkspaceSidebarProps {
  guildId: string | null;
  guildName: string | null;
  mode?: "studio" | "templates";
  activeConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
  onNewChat?: () => void;
  contextTitle?: string;
  onNavigate?: (path: string) => void;
  children?: ReactNode;
}

export default function WorkspaceSidebar({
  guildId,
  guildName,
  mode = "studio",
  activeConversationId = null,
  onSelectConversation,
  onNewChat,
  contextTitle,
  onNavigate,
  children,
}: WorkspaceSidebarProps) {
  const showConversations = mode === "studio";
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const retainedGuildId = useStudioStore((state) => state.selectedGuild);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!showConversations || !guildId) {
      setConversations([]);
      setLoading(false);
      setError("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/conversations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConversationRow[]) => {
        if (!cancelled) {
          setConversations(
            [...data].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )
          );
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId, showConversations]);

  const groups = useMemo(() => groupConversationsByDate(conversations), [conversations]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-shell-border px-4 py-4">
        <Link
          to="/studio"
          onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              onNavigate("/studio");
            }
          }}
          className="mb-3 block truncate rounded px-3 py-2 text-sm font-semibold text-shell-text hover:bg-shell-surface2"
        >
          {guildName ?? "Select a server"}
        </Link>
        <nav className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              if (onNewChat) onNewChat();
              else navigate(retainedGuildId ? `/studio/${retainedGuildId}` : "/studio");
            }}
            className="flex w-full items-center gap-2 rounded bg-shell-accent px-3 py-2 text-left text-sm font-medium text-shell-accent-fg hover:bg-shell-accent-hover"
          >
            <MessageSquarePlus size={14} /> New chat
          </button>
          <NavLink
            to={guildId ? `/studio/${guildId}` : "/studio"}
            onClick={(event) => {
              if (onNavigate) {
                event.preventDefault();
                onNavigate(guildId ? `/studio/${guildId}` : "/studio");
              }
            }}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                isActive ||
                location.pathname === "/studio" ||
                location.pathname.startsWith("/studio/")
                  ? "bg-shell-surface3 text-shell-text"
                  : "text-shell-text-muted hover:bg-shell-surface2 hover:text-shell-text"
              }`
            }
          >
            <LayoutGrid size={14} /> Studio
          </NavLink>
          <NavLink
            to="/templates"
            onClick={(event) => {
              if (onNavigate) {
                event.preventDefault();
                onNavigate("/templates");
              }
            }}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                isActive
                  ? "bg-shell-surface3 text-shell-text"
                  : "text-shell-text-muted hover:bg-shell-surface2 hover:text-shell-text"
              }`
            }
          >
            <FileText size={14} /> Templates
          </NavLink>
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        {showConversations && (
          <>
            <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-shell-text-subtle">
              Recent conversations
            </div>
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-shell-text-muted">
                <Loader size={12} className="animate-spin" /> Loading…
              </div>
            ) : error ? (
              <div className="px-2 py-3 text-xs text-error">{error}</div>
            ) : guildId && conversations.length > 0 ? (
              <Sections
                groups={groups}
                activeId={activeConversationId}
                onSelect={onSelectConversation}
              />
            ) : (
              <div className="px-2 py-3 text-xs text-shell-text-muted">
                {guildId ? "No conversations yet." : "Select a server to see conversations."}
              </div>
            )}
          </>
        )}
        {children && (
          <div className={showConversations ? "mt-4 border-t border-shell-border pt-4" : undefined}>
            {contextTitle && (
              <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-shell-text-subtle">
                {contextTitle}
              </div>
            )}
            {children}
          </div>
        )}
      </div>

      <div className="border-t border-shell-border p-3">
        {isAuthenticated && user && (
          <div className="flex items-center justify-between gap-2 px-3 text-xs text-shell-text-muted">
            <span className="truncate">{user.name}</span>
            <button type="button" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sections({
  groups,
  activeId,
  onSelect,
}: {
  groups: ReturnType<typeof groupConversationsByDate>;
  activeId: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      {(
        [
          ["Today", groups.today],
          ["Yesterday", groups.yesterday],
          ["Earlier", groups.earlier],
        ] as const
      ).map(([label, items]) =>
        items.length ? (
          <div key={label} className="mb-4">
            <div className="px-2 pb-1 text-xs text-shell-text-subtle">{label}</div>
            <ul className="space-y-0.5">
              {items.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(conversation.id)}
                    className={`w-full rounded px-3 py-2 text-left text-sm ${
                      conversation.id === activeId
                        ? "bg-shell-surface3 text-shell-text"
                        : "text-shell-text-muted hover:bg-shell-surface2 hover:text-shell-text"
                    }`}
                    title={conversation.userPrompt || "(no prompt)"}
                  >
                    <div className="truncate font-medium">
                      {conversation.userPrompt || "(no prompt)"}
                    </div>
                    <div className="mt-1 text-[11px] text-shell-text-subtle">
                      {conversation.status}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </>
  );
}
