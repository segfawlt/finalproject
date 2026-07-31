import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Library, Search, GitMerge, Hash, Shield } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface TemplatesTabProps {
  guildId: string;
  /** Opens the planning session the server starts for a merge. */
  onMerge: (conversationId: string) => void;
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
 * each template's shape, and merge one into a fresh planning
 * conversation (the server spins up the session, we open its stream).
 */
export default function TemplatesTab({ guildId, onMerge }: TemplatesTabProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [merging, setMerging] = useState<string | null>(null);

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

  async function mergeTemplate(t: TemplateSummary) {
    if (merging) return;
    setMerging(t.id);
    setError("");
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/templates/${t.id}/merge`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error || `Failed to merge template (${res.status})`);
        return;
      }
      const { conversationId } = (await res.json()) as { conversationId: string };
      onMerge(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMerging(null);
    }
  }

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
    <div className="p-4 space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-shell-text font-semibold text-sm flex items-center gap-2">
            <Library size={14} />
            Templates
          </h2>
          <p className="text-shell-text-muted text-xs">
            Merge a saved template into a new planning conversation.
          </p>
        </div>
        <Link
          to={`/templates/${guildId}`}
          className="text-shell-text-link text-xs hover:underline shrink-0 mt-0.5"
        >
          Manage →
        </Link>
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
            const isMerging = merging === t.id;
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
                  <button
                    onClick={() => mergeTemplate(t)}
                    disabled={merging !== null}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-shell-accent hover:bg-shell-accent-hover text-shell-accent-fg text-xs transition-colors disabled:opacity-60"
                  >
                    <GitMerge size={12} />
                    {isMerging ? "Merging…" : "Merge"}
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
