import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { apiFetch } from "../../lib/api";

interface Rule {
  id: string;
  guildId: string;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Server rules section used by the Studio settings dialog. Hosts per-guild rules —
 * constraints the planner must respect during validation. Formerly
 * lived on the Dashboard's RulesSection; moved here when the Dashboard
 * route was retired.
 */
export default function SettingsTab({ guildId }: { guildId: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/guilds/${guildId}/rules`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Rule[]) => {
        if (!cancelled) setRules(data);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  async function handleAdd() {
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/rules`, {
        method: "POST",
        body: { ruleText: text },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to add rule (${res.status})`);
        return;
      }
      const created = (await res.json()) as Rule;
      setRules((prev) => [...prev, created]);
      setNewText("");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(rule: Rule) {
    setEditingId(rule.id);
    setEditingText(rule.ruleText);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEdit() {
    if (!editingId || submitting) return;
    const text = editingText.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/rules/${editingId}`, {
        method: "PUT",
        body: { ruleText: text },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to update rule (${res.status})`);
        return;
      }
      const updated = (await res.json()) as Rule;
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      cancelEdit();
    } finally {
      setSubmitting(false);
    }
  }
  async function handleDelete(id: string) {
    if (submitting) return;
    if (!confirm("Delete this rule?")) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/rules/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to delete rule (${res.status})`);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div>
        <div className="text-shell-text text-sm font-medium">Server rules</div>
        <p className="text-shell-text-muted text-xs mt-1 leading-relaxed">
          Rules are checked against every plan during validation. The LLM flags violations with
          severity <span className="text-warning">warning</span> or{" "}
          <span className="text-error">block</span>.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="e.g., All admin channels must be private"
          className="flex-1 px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none transition-colors"
          disabled={submitting}
          maxLength={4000}
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || submitting}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md border border-error/30 bg-error/5 text-error text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-shell-text-muted text-sm">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-shell-border bg-shell-surface2/40 px-4 py-6 text-center">
          <div className="text-shell-text text-sm font-medium">No rules yet</div>
          <p className="text-shell-text-muted text-xs mt-1 leading-relaxed">
            Add constraints the planner must respect — the LLM will flag any plan that violates
            them.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            return (
              <li
                key={rule.id}
                className="group flex items-start gap-2 px-3 py-2 bg-shell-surface2 border border-shell-border rounded-md hover:border-shell-border-strong transition-colors"
              >
                {isEditing ? (
                  <>
                    <input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        } else if (e.key === "Escape") {
                          cancelEdit();
                        }
                      }}
                      className="flex-1 px-2 py-1 rounded bg-shell-surface3 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none"
                      autoFocus
                      disabled={submitting}
                      maxLength={4000}
                    />
                    <button
                      onClick={saveEdit}
                      disabled={!editingText.trim() || submitting}
                      className="p-1.5 text-success hover:bg-shell-surface3 rounded transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={submitting}
                      className="p-1.5 text-shell-text-muted hover:bg-shell-surface3 hover:text-shell-text rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-shell-text text-sm break-words">
                      {rule.ruleText}
                    </span>
                    <button
                      onClick={() => startEdit(rule)}
                      disabled={submitting}
                      className="p-1.5 text-shell-text-muted hover:bg-shell-surface3 hover:text-shell-text rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={submitting}
                      className="p-1.5 text-shell-text-muted hover:bg-shell-surface3 hover:text-error rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
