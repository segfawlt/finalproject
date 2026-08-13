import { useEffect, useState } from "react";
import { BookOpen, Plus, X, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  isOfficial: boolean;
  status: string;
  version: number;
}

export interface ActiveTemplate {
  id: string;
  name: string;
}

interface TemplatePanelProps {
  guildId: string;
  conversationId: string;
  active: ActiveTemplate[];
  onActiveChange: (next: ActiveTemplate[]) => void;
}

type Tab = "active" | "browse";

export default function TemplatePanel({
  guildId,
  conversationId,
  active,
  onActiveChange,
}: TemplatePanelProps) {
  const [tab, setTab] = useState<Tab>("active");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "browse" || templates.length > 0) return;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/templates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TemplateSummary[]) => setTemplates(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [tab, guildId, templates.length]);

  async function addTemplate(t: TemplateSummary) {
    if (adding) return;
    setAdding(t.id);
    setError("");
    try {
      const res = await apiFetch(
        `/api/guilds/${guildId}/conversations/${conversationId}/templates`,
        {
          method: "POST",
          body: { templateId: t.id },
        }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to add template");
        return;
      }
      onActiveChange([...active, { id: t.id, name: t.name }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(null);
    }
  }

  async function removeTemplate(templateId: string) {
    setError("");
    try {
      const res = await apiFetch(
        `/api/guilds/${guildId}/conversations/${conversationId}/templates/${templateId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || "Failed to remove template");
        return;
      }
      onActiveChange(active.filter((t) => t.id !== templateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const activeIds = new Set(active.map((a) => a.id));
  const filteredTemplates = templates.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(s) ||
      t.description.toLowerCase().includes(s) ||
      (t.category ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="mb-6 p-5 bg-shell-surface rounded-2xl border border-shell-border max-w-3xl shadow-[0_12px_35px_rgba(0,0,0,0.18)]">
      <div className="flex items-start gap-3 mb-5">
        <div className="mt-0.5 rounded-lg bg-shell-surface3 p-2 text-shell-text">
          <BookOpen size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-shell-text">Template context</div>
          <div className="mt-1 text-xs leading-relaxed text-shell-text-muted">
            Give the planner reusable patterns to work from.
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 p-1 rounded-xl bg-shell-canvas mb-4">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "active"
              ? "bg-shell-accent text-shell-accent-fg"
              : "bg-shell-canvas text-shell-text-muted hover:text-shell-text"
          }`}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setTab("browse")}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === "browse"
              ? "bg-shell-accent text-shell-accent-fg"
              : "bg-shell-canvas text-shell-text-muted hover:text-shell-text"
          }`}
        >
          Browse
        </button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-error/10 border border-error/40 rounded text-error text-xs">
          {error}
        </div>
      )}

      {tab === "active" ? (
        <div>
          {active.length === 0 ? (
            <div className="rounded-xl border border-dashed border-shell-border-strong px-4 py-5 text-center text-sm text-shell-text-muted">
              No templates in context. Switch to{" "}
              <button
                onClick={() => setTab("browse")}
                className="text-shell-text-link underline hover:text-shell-text transition-colors"
              >
                Browse
              </button>{" "}
              to add some.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {active.map((tmpl) => (
                <span
                  key={tmpl.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-shell-canvas text-shell-text rounded-full text-xs border border-shell-border hover:border-shell-border-strong transition-colors"
                >
                  {tmpl.name}
                  <button
                    onClick={() => removeTemplate(tmpl.id)}
                    className="text-shell-text-muted hover:text-shell-text ml-1 transition-colors"
                    aria-label={`Stop using ${tmpl.name}`}
                    title={`Stop using ${tmpl.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="text-xs leading-relaxed text-shell-text-muted">
            Templates are added as context for the planner and can be removed at any time.
          </div>
        </div>
      ) : (
        <div>
          <div className="relative mb-4">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-shell-text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-shell-canvas text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 transition-colors"
            />
          </div>
          {loading ? (
            <div className="text-shell-text-muted text-xs">Loading templates…</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-shell-text-muted text-xs">No templates found.</div>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-auto">
              {filteredTemplates.map((t) => {
                const isActive = activeIds.has(t.id);
                const isAdding = adding === t.id;
                return (
                  <li
                    key={t.id}
                    className="group flex items-start gap-3 p-3 bg-shell-canvas border border-shell-border rounded-xl hover:border-shell-border-strong hover:bg-shell-surface2 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/templates/${t.id}`}
                          className="text-shell-text text-sm font-semibold truncate hover:underline"
                        >
                          {t.name}
                        </Link>
                        {t.isOfficial && (
                          <span className="px-1.5 py-0.5 bg-shell-surface3 text-shell-text-muted rounded text-[10px]">
                            Official
                          </span>
                        )}
                      </div>
                      <div className="text-shell-text-muted text-xs line-clamp-2 mt-0.5">
                        {t.description}
                      </div>
                      <div className="text-shell-text-muted text-[10px] mt-1 flex items-center gap-2">
                        {t.category && <span>{t.category}</span>}
                        {t.tags.length > 0 && <span>· {t.tags.slice(0, 3).join(", ")}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addTemplate(t)}
                      disabled={isActive || isAdding || adding !== null}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-shell-surface2 text-shell-text-muted cursor-default"
                          : isAdding
                            ? "bg-shell-accent/60 text-shell-accent-fg"
                            : "bg-shell-accent hover:bg-shell-accent-hover text-shell-accent-fg"
                      } disabled:opacity-60`}
                    >
                      {isActive ? (
                        "Added"
                      ) : isAdding ? (
                        "Adding…"
                      ) : (
                        <>
                          <Plus size={12} /> Use
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
