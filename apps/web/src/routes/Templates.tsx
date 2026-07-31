import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronRight, Search, FileText } from "lucide-react";
import { apiFetch } from "../lib/api";
import EmptyState from "../components/EmptyState";

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  isOfficial: boolean;
  status: string;
  version: number;
}

export default function Templates() {
  const { guildId } = useParams<{ guildId: string }>();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    apiFetch(`/api/guilds/${guildId}/templates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TemplateSummary[]) => setTemplates(data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [guildId]);

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(s) ||
      t.description.toLowerCase().includes(s) ||
      (t.category ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-shell-text-muted uppercase tracking-wide font-semibold">
            Templates
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-shell-text mt-1">Library</h1>
        </div>
        <Link
          to={`/studio/${guildId ?? ""}`}
          className="inline-flex items-center gap-2 px-3 py-2 bg-shell-surface2 border border-shell-border hover:bg-shell-surface2 hover:border-shell-border-strong text-shell-text-muted hover:text-shell-text rounded text-sm transition-colors"
        >
          Back to Studio
        </Link>
      </div>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-shell-text-muted"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full pl-9 pr-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 transition-colors"
        />
      </div>

      {loading ? (
        <div className="text-shell-text-muted text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        templates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates yet"
            description="Templates can be created from conversation plans. Finish a plan in the Studio to seed your library."
          />
        ) : (
          <div className="text-center text-shell-text-muted text-sm py-8">
            No templates match your search.
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                to={`/templates/${guildId ?? ""}/${t.id}`}
                className="group flex items-start gap-3 px-4 py-3 bg-shell-surface2 border border-shell-border rounded-lg hover:border-shell-border-strong hover:bg-shell-surface2 hover:shadow-lg hover:shadow-black/20 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-shell-text font-medium truncate">{t.name}</span>
                    {t.isOfficial && (
                      <span className="px-1.5 py-0.5 bg-shell-surface3 text-shell-text-muted rounded text-[10px] uppercase">
                        official
                      </span>
                    )}
                    <span className="text-shell-text-muted text-xs">v{t.version}</span>
                  </div>
                  <div className="text-shell-text-muted text-xs mt-1 line-clamp-2">
                    {t.description}
                  </div>
                  {t.category && (
                    <div className="text-shell-text-muted text-[10px] mt-1">{t.category}</div>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-shell-text-muted shrink-0 mt-1 group-hover:text-shell-text group-hover:translate-x-0.5 transition-all"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
