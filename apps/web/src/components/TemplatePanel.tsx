import { useEffect, useState } from "react";
import { Plus, X, Search } from "lucide-react";
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
          body: { templateId: t.id, name: t.name, summary: t.description },
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
    <div className="mb-6 p-4 bg-discord-bg-secondary rounded-lg border border-discord-divider max-w-2xl">
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setTab("active")}
          className={`px-3 py-1 rounded-md text-xs uppercase tracking-wide transition-colors ${
            tab === "active"
              ? "bg-discord-accent text-white"
              : "bg-discord-bg-tertiary text-discord-text-muted hover:text-discord-text"
          }`}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setTab("browse")}
          className={`px-3 py-1 rounded-md text-xs uppercase tracking-wide transition-colors ${
            tab === "browse"
              ? "bg-discord-accent text-white"
              : "bg-discord-bg-tertiary text-discord-text-muted hover:text-discord-text"
          }`}
        >
          Browse
        </button>
      </div>

      {error && (
        <div className="mb-2 p-2 bg-red-900/40 border border-red-700 rounded text-red-200 text-xs">
          {error}
        </div>
      )}

      {tab === "active" ? (
        <div>
          {active.length === 0 ? (
            <div className="text-discord-text-muted text-xs">
              No templates in context. Switch to{" "}
              <button
                onClick={() => setTab("browse")}
                className="text-discord-text-link underline hover:text-white transition-colors"
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
                  className="inline-flex items-center gap-1 px-3 py-1 bg-discord-bg-tertiary text-discord-text rounded-full text-xs border border-discord-divider hover:border-discord-text-subtle/30 transition-colors"
                >
                  {tmpl.name}
                  <button
                    onClick={() => removeTemplate(tmpl.id)}
                    className="text-discord-text-muted hover:text-white ml-1 transition-colors"
                    aria-label={`Remove ${tmpl.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="text-xs text-discord-text-muted">
            Templates are added as ideas for the LLM. They are not merged automatically.
          </div>
        </div>
      ) : (
        <div>
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-discord-text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full pl-7 pr-2 py-1.5 rounded-md bg-discord-bg-tertiary text-discord-text text-sm border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 transition-colors"
            />
          </div>
          {loading ? (
            <div className="text-discord-text-muted text-xs">Loading templates…</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-discord-text-muted text-xs">No templates found.</div>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-auto">
              {filteredTemplates.map((t) => {
                const isActive = activeIds.has(t.id);
                const isAdding = adding === t.id;
                return (
                  <li
                    key={t.id}
                    className="group flex items-start gap-2 p-2 bg-discord-bg-tertiary border border-discord-divider rounded-md hover:border-discord-text-subtle/30 hover:bg-discord-channel-hover transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-discord-text text-sm font-medium truncate">
                          {t.name}
                        </span>
                        {t.isOfficial && (
                          <span className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded text-[10px] uppercase">
                            official
                          </span>
                        )}
                      </div>
                      <div className="text-discord-text-muted text-xs line-clamp-2 mt-0.5">
                        {t.description}
                      </div>
                      <div className="text-discord-text-muted text-[10px] mt-1 flex items-center gap-2">
                        {t.category && <span>{t.category}</span>}
                        {t.tags.length > 0 && <span>· {t.tags.slice(0, 3).join(", ")}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => addTemplate(t)}
                      disabled={isActive || isAdding || adding !== null}
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                        isActive
                          ? "bg-discord-bg-secondary text-discord-text-muted cursor-default"
                          : isAdding
                            ? "bg-discord-accent/60 text-white"
                            : "bg-discord-accent hover:bg-discord-accent-hover text-white"
                      } disabled:opacity-60`}
                    >
                      {isActive ? (
                        "Added"
                      ) : isAdding ? (
                        "Adding…"
                      ) : (
                        <>
                          <Plus size={12} /> Add
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
