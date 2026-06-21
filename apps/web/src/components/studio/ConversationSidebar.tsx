import { useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Loader } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { groupConversationsByDate, type ConversationRow } from "../../lib/group-conversations";

interface ConversationSidebarProps {
  guildId: string;
  activeConversationId: string | null;
  onSelectConversation: (convId: string) => void;
  onNewChat: () => void;
}

export default function ConversationSidebar({
  guildId,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/conversations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConversationRow[]) => {
        if (!cancelled) {
          const sorted = [...data].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          setConversations(sorted);
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
  }, [guildId]);

  const groups = useMemo(() => groupConversationsByDate(conversations), [conversations]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center pt-3 gap-2">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded transition-colors"
          aria-label="Expand conversation history"
          title="Expand"
        >
          <PanelLeftOpen size={16} />
        </button>
        <button
          onClick={onNewChat}
          className="p-1.5 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded transition-colors"
          aria-label="New chat"
          title="New chat"
        >
          <MessageSquarePlus size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-shell-border">
        <span className="text-xs uppercase tracking-wider text-shell-text-muted font-semibold">
          History
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded transition-colors"
          aria-label="Collapse conversation history"
          title="Collapse"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-shell-accent text-shell-accent-fg rounded text-sm font-medium hover:bg-shell-accent-hover transition-colors"
        >
          <MessageSquarePlus size={14} />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-shell-text-muted text-xs">
            <Loader size={12} className="animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="px-2 py-3 text-shell-red text-xs">{error}</div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-6 text-center text-shell-text-subtle text-xs">
            No conversations yet.
            <br />
            Start one above.
          </div>
        ) : (
          <Sections
            groups={groups}
            activeId={activeConversationId}
            onSelect={onSelectConversation}
          />
        )}
      </div>
    </div>
  );
}

interface SectionsProps {
  groups: ReturnType<typeof groupConversationsByDate>;
  activeId: string | null;
  onSelect: (id: string) => void;
}

function Sections({ groups, activeId, onSelect }: SectionsProps) {
  const renderSection = (label: string, items: ConversationRow[]) =>
    items.length === 0 ? null : (
      <div className="mb-4">
        <div className="px-2 mb-1.5 text-[10px] uppercase tracking-wider text-shell-text-subtle font-semibold">
          {label}
        </div>
        <ul className="space-y-0.5">
          {items.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </ul>
      </div>
    );

  return (
    <>
      {renderSection("Today", groups.today)}
      {renderSection("Yesterday", groups.yesterday)}
      {renderSection("Earlier", groups.earlier)}
    </>
  );
}

function ConversationItem({
  conv,
  active,
  onClick,
}: {
  conv: ConversationRow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors group ${
          active
            ? "bg-shell-surface3 text-shell-text"
            : "text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2"
        }`}
        title={conv.userPrompt || "(no prompt)"}
      >
        <div className="truncate font-medium">
          {conv.userPrompt || <span className="italic text-shell-text-subtle">(no prompt)</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-shell-text-subtle">
          <span className="uppercase tracking-wider">{conv.status}</span>
        </div>
      </button>
    </li>
  );
}
