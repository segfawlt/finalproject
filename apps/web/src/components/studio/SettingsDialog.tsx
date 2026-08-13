import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import SettingsTab from "./SettingsTab";
import type { StudioModel } from "./ModelSelector";
import type { DeploymentModelSettings } from "../../hooks/conversation-model-config";

interface SettingsDialogProps {
  guildId: string;
  open: boolean;
  onClose: () => void;
  onModelsSaved: (settings: DeploymentModelSettings) => Promise<void>;
}

export function getNextFocusIndex(length: number, index: number, backwards: boolean): number {
  if (length < 1) return -1;
  if (backwards) return index === 0 ? length - 1 : index - 1;
  return index === length - 1 ? 0 : index + 1;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hasAttribute("hidden"));
}

function reasoningSummary(model: StudioModel): string {
  const reasoning = model.reasoning;
  if (reasoning?.supportedEfforts?.length) {
    return `Reasoning effort: ${reasoning.supportedEfforts.join(", ")}`;
  }
  if (reasoning?.supportsMaxTokens && reasoning.maxTokens) {
    return `Reasoning budget up to ${reasoning.maxTokens} tokens`;
  }
  return "Reasoning unavailable";
}

export default function SettingsDialog({ guildId, open, onClose, onModelsSaved }: SettingsDialogProps) {
  const [models, setModels] = useState<StudioModel[]>([]);
  const [modelIds, setModelIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch("/api/settings/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
        return (await res.json()) as { modelIds: string[]; models: StudioModel[] };
      })
      .then((data) => {
        if (!cancelled) {
          setModels(data.models.filter((model) => model.supportsTools));
          setModelIds(data.modelIds);
        }
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const [first] = dialog ? getFocusableElements(dialog) : [];
    (first ?? dialog)?.focus();

    return () => {
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const filteredModels = models.filter((model) => {
    const search = query.trim().toLowerCase();
    return (
      !search || `${model.name} ${model.id} ${model.description}`.toLowerCase().includes(search)
    );
  });

  function toggleModel(modelId: string) {
    setModelIds((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      return current.length < 2 ? [...current, modelId] : current;
    });
  }

  async function saveModels() {
    if (modelIds.length < 1 || modelIds.length > 2 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/settings/models", { method: "PUT", body: { modelIds } });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `Failed to save models (${res.status})`);
        return;
      }
      const saved = (await res.json()) as DeploymentModelSettings;
      await onModelsSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const elements = getFocusableElements(event.currentTarget);
          const index = elements.indexOf(document.activeElement as HTMLElement);
          const nextIndex = getNextFocusIndex(elements.length, index < 0 ? 0 : index, event.shiftKey);
          if (nextIndex < 0) return;
          event.preventDefault();
          elements[nextIndex]?.focus();
        }}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden border border-shell-border-strong bg-shell-surface shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-shell-border px-5 py-4">
          <div>
            <h2 id="settings-dialog-title" className="text-sm font-semibold text-shell-text">
              Settings
            </h2>
            <p className="mt-0.5 text-xs text-shell-text-muted">
              Deployment models and server rules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded p-1.5 text-shell-text-muted transition-colors hover:bg-shell-surface2 hover:text-shell-text"
          >
            <X size={16} />
          </button>
        </header>
        <div className="grid min-h-0 overflow-y-auto md:grid-cols-2">
          <div className="border-b border-shell-border p-5 md:border-b-0 md:border-r">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-shell-text">AI models</h3>
                <p className="mt-1 text-xs leading-relaxed text-shell-text-muted">
                  Choose one or two tool-capable models for this deployment. API keys are managed by
                  the server and are never shown here.
                </p>
              </div>
              <button
                type="button"
                onClick={saveModels}
                disabled={saving || loading || modelIds.length < 1}
                className="inline-flex shrink-0 items-center gap-1.5 rounded bg-shell-accent px-3 py-1.5 text-xs font-medium text-shell-accent-fg transition-colors hover:bg-shell-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check size={13} /> {saving ? "Saving" : "Save"}
              </button>
            </div>
            {error && (
              <div className="mb-3 border border-error/30 bg-error/5 p-2 text-xs text-error">
                {error}
              </div>
            )}
            <label className="relative mb-3 block">
              <Search size={13} className="absolute left-2.5 top-2.5 text-shell-text-subtle" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tool-capable models"
                className="w-full border border-shell-border bg-shell-surface2 py-2 pl-8 pr-3 text-xs text-shell-text outline-none focus:border-shell-accent"
              />
            </label>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-shell-text-subtle">
              Selected {modelIds.length}/2
            </div>
            {modelIds.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {modelIds.map((modelId) => {
                  const model = models.find((candidate) => candidate.id === modelId);
                  return (
                    <span
                      key={modelId}
                      className="inline-flex items-center gap-1 border border-shell-border bg-shell-surface2 px-2 py-1 text-[11px] text-shell-text"
                    >
                      {model?.name ?? modelId}
                      <button
                        type="button"
                        onClick={() => toggleModel(modelId)}
                        aria-label={`Remove ${model?.name ?? modelId}`}
                        className="text-shell-text-subtle hover:text-shell-text"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {loading ? (
              <div className="text-xs text-shell-text-muted">Loading model catalog...</div>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {filteredModels.map((model) => {
                  const selected = modelIds.includes(model.id);
                  const unavailable = !selected && modelIds.length === 2;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModel(model.id)}
                      disabled={unavailable}
                      className={`w-full border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected
                          ? "border-shell-accent bg-shell-surface2"
                          : "border-shell-border hover:border-shell-border-strong hover:bg-shell-surface2/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-shell-text">{model.name}</span>
                        {selected && <Check size={13} className="shrink-0 text-agent-done" />}
                      </div>
                      <div className="mt-1 text-[11px] text-shell-text-subtle">
                        {model.id.split("/")[0]} · {model.id}
                      </div>
                      {model.description && (
                        <p className="mt-1 text-xs text-shell-text-muted">{model.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-shell-text-subtle">
                        {reasoningSummary(model)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="min-h-0">
            <SettingsTab guildId={guildId} />
          </div>
        </div>
      </section>
    </div>
  );
}
