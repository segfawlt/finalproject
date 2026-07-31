import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Save, Trash2, GitFork, ArrowLeft, Pencil, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import DesiredStateView from "../components/DesiredStateView";
import { useDesiredStateEdit } from "../hooks/useDesiredStateEdit";
import type { DesiredState } from "../components/desired-state";

/** Free-form template structure is stored as `DesiredState.active`. */
type TemplateStructure = DesiredState["active"];

// Symbol ids look like `$ch_3` / `$role_12`. Seed the counter past the
// highest existing one so newly-added items don't collide.
function seedSymbolCounter(active: TemplateStructure): number {
  let max = -1;
  const keys = [...Object.keys(active.channels ?? {}), ...Object.keys(active.roles ?? {})];
  for (const k of keys) {
    const m = /^\$\w+_(\d+)$/.exec(k);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

// Wrap the stored structure into a DesiredState the editor can mutate.
function wrapStructure(
  structure: Record<string, unknown>,
  name: string,
  version: number
): DesiredState {
  const s = structure as Partial<TemplateStructure>;
  const active: TemplateStructure = {
    channels: s.channels ?? {},
    roles: s.roles ?? {},
    overwrites: s.overwrites ?? {},
    memberRoles: s.memberRoles ?? {},
  };
  return {
    guildId: "",
    guildName: name,
    active,
    tombstones: [],
    symbolCounter: seedSymbolCounter(active),
    version,
  };
}

interface TemplateDetail {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: Record<string, unknown>;
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
  const [savingStructure, setSavingStructure] = useState(false);

  const edit = useDesiredStateEdit();

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

  function editStructure() {
    if (!template) return;
    edit.beginEdit(wrapStructure(template.structure, template.name, template.version));
  }

  async function saveStructure() {
    if (!guildId || !templateId || !edit.editableState) return;
    if (savingStructure) return;
    setSavingStructure(true);
    setError("");
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/templates/${templateId}`, {
        method: "PUT",
        body: { structure: edit.editableState.active },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to save structure");
      }
      const updated = (await res.json()) as TemplateDetail;
      setTemplate(updated);
      edit.finishEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingStructure(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-shell-text-muted">
        Loading…
      </div>
    );
  }

  if (error && !template) {
    return (
      <div className="flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="p-4 bg-error/10 border border-error/40 rounded text-error text-sm">
            {error}
          </div>
          <Link
            to={`/templates/${guildId ?? ""}`}
            className="mt-4 inline-block text-shell-text-link text-sm"
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
              className="inline-flex items-center gap-1 text-shell-text-muted hover:text-shell-text text-sm transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-shell-text mt-2">
              Edit template
            </h1>
            <div className="text-shell-text-muted text-xs mt-1">
              v{template.version} · id: {template.id}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fork}
              disabled={forking}
              className="inline-flex items-center gap-1 px-3 py-2 bg-shell-surface2 border border-shell-border hover:bg-shell-surface2 hover:border-shell-border-strong disabled:opacity-50 text-shell-text rounded text-sm transition-colors"
            >
              <GitFork size={14} /> {forking ? "Forking…" : "Fork"}
            </button>
            <button
              onClick={deleteTemplate}
              disabled={deleting}
              className="inline-flex items-center gap-1 px-3 py-2 bg-error/15 border border-error/40 hover:bg-error/25 disabled:opacity-50 text-error rounded text-sm transition-colors"
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete"}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-2 bg-shell-accent hover:bg-shell-accent-hover disabled:opacity-50 text-shell-accent-fg rounded text-sm font-medium transition-colors"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-error/10 border border-error/40 rounded text-error text-sm">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 rounded bg-shell-surface2 text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full p-2 rounded bg-shell-surface2 text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Category">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., community, support, gaming"
              className="w-full p-2 rounded bg-shell-surface2 text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 text-sm transition-colors"
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., rpg, moderation, beginner"
              className="w-full p-2 rounded bg-shell-surface2 text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none focus:ring-1 focus:ring-shell-accent/30 text-sm transition-colors"
            />
          </Field>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-shell-text-muted uppercase tracking-wide font-semibold">
              Structure
            </div>
            {edit.editing ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={edit.cancelEdit}
                  disabled={savingStructure}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-shell-surface2 border border-shell-border hover:bg-shell-surface2 disabled:opacity-50 text-shell-text rounded text-xs transition-colors"
                >
                  <X size={13} /> Cancel
                </button>
                <button
                  onClick={saveStructure}
                  disabled={savingStructure}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-shell-accent hover:bg-shell-accent-hover disabled:opacity-50 text-shell-accent-fg rounded text-xs font-medium transition-colors"
                >
                  <Save size={13} /> {savingStructure ? "Saving…" : "Save structure"}
                </button>
              </div>
            ) : (
              <button
                onClick={editStructure}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-shell-surface2 border border-shell-border hover:bg-shell-surface2 text-shell-text rounded text-xs transition-colors"
              >
                <Pencil size={13} /> Edit structure
              </button>
            )}
          </div>
          <div className="p-3 bg-shell-canvas border border-shell-border rounded max-h-[32rem] overflow-auto">
            <DesiredStateView
              desiredState={
                edit.editing ? edit.editableState : wrapStructure(template.structure, template.name, template.version)
              }
              editing={edit.editing}
              onChannelChange={edit.patchChannel}
              onChannelDelete={edit.deleteChannel}
              onChannelAdd={edit.addChannel}
              onCategoryChange={edit.patchChannel}
              onCategoryDelete={edit.deleteChannel}
              onCategoryAdd={edit.addCategory}
              onRoleChange={edit.patchRole}
              onRoleDelete={edit.deleteRole}
              onRoleAdd={edit.addRole}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-shell-text-muted uppercase tracking-wide font-semibold mb-1">
        {label}
      </div>
      {children}
    </label>
  );
}
