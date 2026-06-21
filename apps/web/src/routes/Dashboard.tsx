import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useDashboardStore } from "../stores/dashboardStore";
import { apiFetch } from "../lib/api";
import {
  ChevronRight,
  History as HistoryIcon,
  Plus,
  Settings,
  Library,
  Inbox,
  Compass,
} from "lucide-react";
import EmptyState from "../components/EmptyState";
import RulesSection from "../components/RulesSection";

interface GuildSummary {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

interface ConversationRow {
  id: string;
  guildId: string;
  userId: string;
  status: string;
  userPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export default function Dashboard() {
  const { guildId } = useParams<{ guildId: string }>();
  const setSelectedGuild = useDashboardStore((s) => s.setSelectedGuild);

  useEffect(() => {
    setSelectedGuild(guildId ?? null);
  }, [guildId, setSelectedGuild]);

  if (!guildId) {
    return <GuildListView />;
  }
  return <GuildDashboardView guildId={guildId} />;
}

function GuildListView() {
  const [guilds, setGuilds] = useState<GuildSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/guilds")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GuildSummary[]) => setGuilds(data))
      .catch(() => setGuilds([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8">
      <div className="mb-6">
        <div className="text-xs text-discord-text-muted uppercase tracking-wide font-semibold">
          Dashboard
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-discord-text mt-1">
          Choose a guild
        </h1>
        <p className="text-discord-text-muted text-sm mt-1">
          Pick a server to manage with Discord Platform.
        </p>
      </div>

      {loading ? (
        <div className="text-discord-text-muted text-sm">Loading guilds…</div>
      ) : guilds.length === 0 ? (
        <EmptyState
          icon={Compass}
          title="No guilds available"
          description="Invite the planning bot to a server you administer, then come back here."
        />
      ) : (
        <ul className="space-y-2">
          {guilds.map((g) => (
            <li key={g.id}>
              <Link
                to={`/dashboard/${g.id}`}
                className="group flex items-center gap-3 px-4 py-3 bg-discord-bg-secondary border border-discord-divider rounded-lg hover:border-discord-text-subtle/30 hover:bg-discord-channel-hover hover:shadow-lg hover:shadow-black/20 hover:-translate-y-px transition-all"
              >
                {g.icon ? (
                  <img
                    src={g.icon}
                    alt=""
                    className="w-10 h-10 rounded-full bg-discord-bg-tertiary"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-discord-bg-tertiary flex items-center justify-center text-discord-text font-semibold">
                    {g.name[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-discord-text font-medium truncate">{g.name}</div>
                  <div className="text-discord-text-muted text-xs">{g.memberCount} members</div>
                </div>
                <ChevronRight
                  size={18}
                  className="text-discord-text-muted group-hover:text-discord-text group-hover:translate-x-0.5 transition-all"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GuildDashboardView({ guildId }: { guildId: string }) {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [guildName, setGuildName] = useState<string>(guildId);

  useEffect(() => {
    apiFetch(`/api/guilds/${guildId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { name?: string } | null) => {
        if (data?.name) setGuildName(data.name);
      })
      .catch(() => {});
  }, [guildId]);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/guilds/${guildId}/conversations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ConversationRow[]) => setConversations(data))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-discord-text-muted uppercase tracking-wide font-semibold">
            Dashboard
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-discord-text mt-1">
            {guildName}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/studio/${guildId}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded text-sm font-medium transition-colors shadow-sm shadow-discord-accent/20"
          >
            <Plus size={16} /> New plan
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-3 py-2 bg-discord-bg-secondary border border-discord-divider hover:bg-discord-channel-hover hover:border-discord-text-subtle/30 text-discord-text-muted hover:text-discord-text rounded text-sm transition-colors"
          >
            Switch guild
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-discord-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <HistoryIcon size={14} /> Recent plans
        </h2>
        {loading ? (
          <div className="text-discord-text-muted text-sm">Loading…</div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No plans yet"
            description="Start a new plan to draft a server configuration with AI."
            action={{
              label: "New plan",
              onClick: () => {
                window.location.href = `/studio/${guildId}`;
              },
            }}
          />
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <ConversationRowItem key={c.id} conv={c} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-discord-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Library size={14} /> Templates
        </h2>
        <Link
          to={`/templates/${guildId}`}
          className="group flex items-center justify-between px-4 py-3 bg-discord-bg-secondary border border-discord-divider rounded-lg hover:border-discord-text-subtle/30 hover:bg-discord-channel-hover hover:shadow-lg hover:shadow-black/20 transition-all"
        >
          <span className="text-discord-text text-sm">Browse template library</span>
          <ChevronRight
            size={16}
            className="text-discord-text-muted group-hover:text-discord-text group-hover:translate-x-0.5 transition-all"
          />
        </Link>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-discord-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Settings size={14} /> Rules
        </h2>
        <RulesSection guildId={guildId} />
      </section>
    </div>
  );
}

function ConversationRowItem({ conv }: { conv: ConversationRow }) {
  return (
    <li>
      <Link
        to={`/studio/${conv.guildId}`}
        className="group flex items-start gap-3 px-4 py-3 bg-discord-bg-secondary border border-discord-divider rounded-lg hover:border-discord-text-subtle/30 hover:bg-discord-channel-hover transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="text-discord-text text-sm truncate">
            {conv.userPrompt || <span className="italic text-discord-text-muted">(no prompt)</span>}
          </div>
          <div className="text-discord-text-muted text-xs flex items-center gap-2 mt-1">
            <StatusBadge status={conv.status} />
            <span>·</span>
            <span>{formatTime(conv.createdAt)}</span>
          </div>
        </div>
        <ChevronRight
          size={16}
          className="text-discord-text-muted shrink-0 mt-1 group-hover:text-discord-text group-hover:translate-x-0.5 transition-all"
        />
      </Link>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { className, label } = styleFor(status);
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

function styleFor(status: string): { className: string; label: string } {
  switch (status) {
    case "completed":
      return { className: "bg-green-900/50 text-green-300", label: "completed" };
    case "cancelled":
      return { className: "bg-red-900/50 text-red-300", label: "cancelled" };
    case "approved":
      return { className: "bg-blue-900/50 text-blue-300", label: "approved" };
    default:
      return { className: "bg-discord-bg-tertiary text-discord-text-muted", label: status };
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
