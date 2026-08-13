import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Search, Hash, Shield, ExternalLink } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface TemplatesTabProps {
  guildId: string;
  conversationId: string | null;
  activeTemplates: Array<{ id: string; name: string }>;
  onActiveTemplatesChange: (next: Array<{ id: string; name: string }>) => void;
}

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  tags: string[];
  isOfficial: boolean;
  status: string;
  version: number;
  structure?: {
    channels?: Record<string, unknown>;
    roles?: Record<string, unknown>;
  } | null;
}

/**
 * In-panel template browser: search the per-server library, preview
 * each template's shape and attach it to the active planning conversation.
 */
export default function TemplatesTab({
  guildId,
  conversationId,
  activeTemplates,
  onActiveTemplatesChange,
}: TemplatesTabProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/templates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: TemplateSummary[]) => {
        if (!cancelled) setTemplates(data);
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

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(s) ||
      t.description.toLowerCase().includes(s) ||
      (t.category ?? "").toLowerCase().includes(s)
    );
  });

  const activeIds = new Set(activeTemplates.map((template) => template.id));

  async function toggleTemplate(template: TemplateSummary) {
    if (updating) return;
    const active = activeIds.has(template.id);

    if (!conversationId) {
      onActiveTemplatesChange(
        active
          ? activeTemplates.filter((item) => item.id !== template.id)
          : [...activeTemplates, { id: template.id, name: template.name }]
      );
      return;
    }

    setUpdating(template.id);
    setError("");
    try {
      const response = await apiFetch(
        `/api/guilds/${guildId}/conversations/${conversationId}/templates${active ? `/${template.id}` : ""}`,
        active
          ? { method: "DELETE" }
          : {
              method: "POST",
              body: { templateId: template.id },
            }
      );
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error || `Failed to ${active ? "stop using" : "use"} template`);
        return;
      }
      onActiveTemplatesChange(
        active
          ? activeTemplates.filter((item) => item.id !== template.id)
          : [...activeTemplates, { id: template.id, name: template.name }]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-shell-text font-semibold text-sm flex items-center gap-2">
            <Library size={14} />
            Templates
          </h2>
          <p className="text-shell-text-muted text-xs">
            Add reusable template context to the current conversation.
          </p>
        </div>
      </header>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-shell-text-muted"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full pl-7 pr-2 py-1.5 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 transition-colors"
        />
      </div>

      {error && (
        <div className="p-2 rounded border border-error/40 bg-error/10 text-error text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-shell-text-muted text-xs">Loading templates…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-shell-border p-4 text-center text-shell-text-muted text-sm">
          {templates.length === 0
            ? "No templates yet. Save one from a completed plan."
            : "No templates match your search."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const channelCount = Object.keys(t.structure?.channels ?? {}).length;
            const roleCount = Object.keys(t.structure?.roles ?? {}).length;
            return (
              <li
                key={t.id}
                className="p-2.5 rounded-md border border-shell-border bg-shell-surface2 hover:border-shell-border-strong transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-shell-text text-sm font-medium truncate">{t.name}</span>
                  {t.isOfficial && (
                    <span className="px-1.5 py-0.5 rounded bg-shell-accent/20 text-shell-accent text-[10px] uppercase">
                      official
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-shell-text-muted text-xs line-clamp-2 mt-0.5">
                    {t.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-shell-text-subtle text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <Hash size={11} /> {channelCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Shield size={11} /> {roleCount}
                  </span>
                  {t.category && <span>· {t.category}</span>}
                </div>
                <div className="mt-2 flex justify-end">
                  <Link
                    to={`/templates/${t.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-shell-surface3 text-shell-text text-xs transition-colors hover:bg-shell-border-strong"
                  >
                    <ExternalLink size={12} />
                    View template
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleTemplate(t)}
                    disabled={updating !== null}
                    aria-label={activeIds.has(t.id) ? `Stop using ${t.name}` : `Use ${t.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-shell-accent text-shell-accent-fg text-xs transition-colors hover:bg-shell-accent-hover disabled:opacity-60"
                  >
                    {updating === t.id ? "Updating…" : activeIds.has(t.id) ? "Stop using" : "Use"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
