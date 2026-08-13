import { useState } from "react";
import { Library, Loader, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { DesiredState } from "../desired-state/types";

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  desiredState: DesiredState;
}

/**
 * Saves the current plan's desired state as a reusable template. The
 * template's `structure` is the desired state's `active` block (channels,
 * roles, overwrites, member roles) — the same shape the merge flow feeds
 * back to the planner.
 */
export default function SaveTemplateModal({ open, onClose, desiredState }: SaveTemplateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  async function save() {
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    if (!trimmedName || !trimmedDesc || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/templates", {
        method: "POST",
        body: {
          name: trimmedName,
          description: trimmedDesc,
          structure: desiredState.active,
          category: category.trim() || undefined,
        },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Failed to save template (${res.status})`);
        return;
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function close() {
    setName("");
    setDescription("");
    setCategory("");
    setError("");
    setSaved(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-lg border border-shell-border bg-shell-surface shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-shell-border px-4 py-3">
          <div className="flex items-center gap-2 text-shell-text font-medium text-sm">
            <Library size={15} />
            Save as template
          </div>
          <button
            onClick={close}
            className="text-shell-text-muted hover:text-shell-text p-1 rounded transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {saved ? (
          <div className="p-5 space-y-4">
            <p className="text-shell-text text-sm">
              Template saved. It&apos;s now available in the Templates tab and library.
            </p>
            <button
              onClick={close}
              className="w-full px-4 py-2 rounded-md bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="e.g., Community starter layout"
                className="w-full px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none transition-colors"
                maxLength={200}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What this template sets up and when to use it"
                className="w-full px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none transition-colors resize-none"
              />
            </Field>
            <Field label="Category (optional)">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., community, support, gaming"
                className="w-full px-3 py-2 rounded-md bg-shell-surface2 text-shell-text text-sm border border-shell-border focus:border-shell-accent focus:outline-none transition-colors"
              />
            </Field>

            {error && (
              <div className="p-3 rounded-md border border-error/30 bg-error/5 text-error text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={close}
                className="px-3 py-2 rounded-md bg-shell-surface2 text-shell-text border border-shell-border hover:border-shell-border-strong text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!name.trim() || !description.trim() || saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-shell-accent text-shell-accent-fg hover:bg-shell-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                {saving ? <Loader size={13} className="animate-spin" /> : <Library size={13} />}
                Save template
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-shell-text-muted uppercase tracking-wide font-semibold mb-1.5">
        {label}
      </div>
      {children}
    </label>
  );
}
