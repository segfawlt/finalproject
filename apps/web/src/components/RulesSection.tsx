import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, X, Check, FileText } from "lucide-react";
import { apiFetch } from "../lib/api";
import EmptyState from "./EmptyState";

interface Rule {
  id: string;
  guildId: string;
  ruleText: string;
  createdAt: string;
  updatedAt: string;
}

export default function RulesSection({ guildId }: { guildId: string }) {
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
    <div className="space-y-3">
      <p className="text-discord-text-muted text-xs">
        Rules are checked against every plan during validation. The LLM flags violations with
        severity <span className="text-discord-yellow">warning</span> or{" "}
        <span className="text-discord-red">block</span>.
      </p>

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
          className="flex-1 px-3 py-2 rounded-md bg-discord-bg-secondary text-discord-text text-sm border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 transition-colors"
          disabled={submitting}
          maxLength={4000}
        />
        <button
          onClick={handleAdd}
          disabled={!newText.trim() || submitting}
          className="inline-flex items-center gap-2 px-3 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:bg-discord-bg-tertiary disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Add
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-discord-text-muted text-sm">Loading…</div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No rules yet"
          description="Add constraints the planner must respect — the LLM will flag any plan that violates them."
        />
      ) : (
        <ul className="space-y-1.5">
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            return (
              <li
                key={rule.id}
                className="group flex items-start gap-2 px-3 py-2 bg-discord-bg-secondary border border-discord-divider rounded-md hover:border-discord-text-subtle/30 transition-colors"
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
                      className="flex-1 px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text text-sm border border-discord-divider focus:border-discord-accent focus:outline-none"
                      autoFocus
                      disabled={submitting}
                      maxLength={4000}
                    />
                    <button
                      onClick={saveEdit}
                      disabled={!editingText.trim() || submitting}
                      className="p-1.5 text-discord-green hover:bg-discord-channel-hover rounded transition-colors disabled:opacity-50"
                      title="Save"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={submitting}
                      className="p-1.5 text-discord-text-muted hover:bg-discord-channel-hover hover:text-discord-text rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-discord-text text-sm break-words">
                      {rule.ruleText}
                    </span>
                    <button
                      onClick={() => startEdit(rule)}
                      disabled={submitting}
                      className="p-1.5 text-discord-text-muted hover:bg-discord-channel-hover hover:text-discord-text rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={submitting}
                      className="p-1.5 text-discord-text-muted hover:bg-discord-channel-hover hover:text-discord-red rounded transition-colors opacity-0 group-hover:opacity-100"
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
