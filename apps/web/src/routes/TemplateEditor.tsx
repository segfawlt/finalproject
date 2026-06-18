import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Save, Trash2, GitFork, ArrowLeft } from "lucide-react";
import { apiFetch } from "../lib/api";

interface TemplateDetail {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
  validationRules: Array<Record<string, unknown>>;
  category: string | null;
  tags: string[];
  guildId: string | null;
  authorId: string | null;
  isOfficial: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function TemplateEditor() {
  const { guildId, templateId } = useParams<{ guildId: string; templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    if (!guildId || !templateId) return;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/templates/${templateId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `Failed to load template (${res.status})`);
        }
        return res.json();
      })
      .then((data: TemplateDetail) => {
        setTemplate(data);
        setName(data.name);
        setDescription(data.description);
        setCategory(data.category ?? "");
        setTagsText(data.tags.join(", "));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [guildId, templateId]);

  async function save() {
    if (!guildId || !templateId || !template) return;
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/templates/${templateId}`, {
        method: "PUT",
        body: {
          name,
          description,
          category: category || null,
          tags: tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Save failed");
      }
      const updated = (await res.json()) as TemplateDetail;
      setTemplate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate() {
    if (!guildId || !templateId) return;
    if (!window.confirm(`Delete template "${name}"?`)) return;
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/templates/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Delete failed");
      }
      navigate(`/templates/${guildId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  async function fork() {
    if (!guildId || !template) return;
    if (forking) return;
    setForking(true);
    setError("");
    try {
      const newId = `${template.id}-fork-${Date.now()}`;
      const res = await apiFetch(`/api/guilds/${guildId}/templates`, {
        method: "POST",
        body: {
          id: newId,
          name: `${template.name} (copy)`,
          description: template.description,
          structure: template.structure,
          questions: template.questions,
          validationRules: template.validationRules,
          category: template.category,
          tags: template.tags,
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Fork failed");
      }
      const created = (await res.json()) as TemplateDetail;
      navigate(`/templates/${guildId}/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setForking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-discord-text-muted">
        Loading…
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="p-4 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
          <Link
            to={`/templates/${guildId ?? ""}`}
            className="mt-4 inline-block text-discord-text-link text-sm"
          >
            Back to library
          </Link>
        </div>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="flex-1">
      <div className="max-w-3xl mx-auto p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link
              to={`/templates/${guildId ?? ""}`}
              className="inline-flex items-center gap-1 text-discord-text-muted hover:text-discord-text text-sm transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-discord-text mt-2">
              Edit template
            </h1>
            <div className="text-discord-text-muted text-xs mt-1">
              v{template.version} · id: {template.id}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fork}
              disabled={forking}
              className="inline-flex items-center gap-1 px-3 py-2 bg-discord-bg-secondary border border-discord-divider hover:bg-discord-channel-hover hover:border-discord-text-subtle/30 disabled:opacity-50 text-discord-text rounded text-sm transition-colors"
            >
              <GitFork size={14} /> {forking ? "Forking…" : "Fork"}
            </button>
            <button
              onClick={deleteTemplate}
              disabled={deleting}
              className="inline-flex items-center gap-1 px-3 py-2 bg-discord-red/20 border border-discord-red/40 hover:bg-discord-red/30 disabled:opacity-50 text-discord-red rounded text-sm transition-colors"
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:opacity-50 text-white rounded text-sm font-medium transition-colors"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/40 border border-red-700 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full p-2 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Category">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., community, support, gaming"
              className="w-full p-2 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., rpg, moderation, beginner"
              className="w-full p-2 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none focus:ring-1 focus:ring-discord-accent/30 text-sm transition-colors"
            />
          </Field>
        </section>

        <section>
          <div className="text-xs text-discord-text-muted uppercase tracking-wide font-semibold mb-2">
            Structure (read-only)
          </div>
          <pre className="p-3 bg-discord-bg-tertiary border border-discord-divider rounded text-xs text-discord-text-muted overflow-auto max-h-96 font-mono">
            {JSON.stringify(template.structure, null, 2)}
          </pre>
          <div className="text-xs text-discord-text-muted mt-2">
            Editing the structure requires the manual-editing endpoint, which is not yet
            implemented. Fork this template to create a new copy you can edit in code.
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-discord-text-muted uppercase tracking-wide font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
