import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Search, FileText, Plus } from "lucide-react";
import { apiFetch } from "../lib/api";
import EmptyState from "../components/EmptyState";
import StudioShell from "../components/studio/StudioShell";
import WorkspaceSidebar from "../components/studio/WorkspaceSidebar";

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  status: string;
  version: number;
  structure: Record<string, unknown>;
  updatedAt: string;
}

function structureCounts(structure: Record<string, unknown>) {
  const channels = structure.channels;
  const roles = structure.roles;
  return {
    channels: channels && typeof channels === "object" ? Object.keys(channels).length : 0,
    roles: roles && typeof roles === "object" ? Object.keys(roles).length : 0,
  };
}

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function createBlank() {
    const res = await apiFetch("/api/templates", {
      method: "POST",
      body: { name: "Untitled template", description: "" },
    });
    if (res.ok) {
      const created = (await res.json()) as { id: string };
      navigate(`/templates/${created.id}/studio`);
    }
  }

  useEffect(() => {
    setLoading(true);
    apiFetch("/api/templates")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TemplateSummary[]) => setTemplates(data))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

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
    <StudioShell sidebar={<WorkspaceSidebar guildId={null} guildName={null} mode="templates" />}>
      <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-shell-text-muted uppercase tracking-wide font-semibold">
              Templates
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-shell-text mt-1">Library</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void createBlank()}
              className="inline-flex items-center gap-2 rounded bg-shell-accent px-3 py-2 text-sm text-shell-accent-fg"
            >
              <Plus size={14} /> Create blank template
            </button>
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 px-3 py-2 bg-shell-surface2 border border-shell-border hover:bg-shell-surface2 hover:border-shell-border-strong text-shell-text-muted hover:text-shell-text rounded text-sm transition-colors"
            >
              Back to Studio
            </Link>
          </div>
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
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => (
              <li key={t.id}>
                <Link
                  to={`/templates/${t.id}`}
                  className="group flex h-64 items-start gap-3 rounded-lg border border-shell-border bg-shell-surface2 px-4 py-3 transition-all hover:border-shell-border-strong hover:bg-shell-surface2 hover:shadow-lg hover:shadow-black/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-shell-text font-medium truncate">{t.name}</span>
                      <span className="text-shell-text-muted text-xs">v{t.version}</span>
                    </div>
                    <div className="text-shell-text-muted text-xs mt-1 line-clamp-2">
                      {t.description}
                    </div>
                    <div className="mt-4 flex items-center gap-3 text-xs text-shell-text-muted">
                      <span>
                        {structureCounts(t.structure).channels} channel
                        {structureCounts(t.structure).channels === 1 ? "" : "s"}
                      </span>
                      <span>
                        {structureCounts(t.structure).roles} role
                        {structureCounts(t.structure).roles === 1 ? "" : "s"}
                      </span>
                    </div>
                    {(t.category || t.tags.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-shell-text-muted">
                        {t.category && <span>{t.category}</span>}
                        {t.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 text-xs text-shell-text-muted">
                      Updated{" "}
                      {new Date(t.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
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
    </StudioShell>
  );
}
