import { useEffect, useState } from "react";
import { ArrowLeft, GitFork, Save, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import StudioShell from "../components/studio/StudioShell";
import WorkspaceSidebar from "../components/studio/WorkspaceSidebar";
import TemplatePreview from "../components/template-studio/TemplatePreview";
import TemplateVersionHistory, {
  type TemplateVersion,
} from "../components/template-studio/TemplateVersionHistory";
import { apiFetch } from "../lib/api";
import { useTemplateAuthoring } from "../hooks/useTemplateAuthoring";
import SharedComposer from "../components/studio/SharedComposer";

interface TemplateDetail {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: Record<string, unknown>;
  category: string | null;
  tags: string[];
  updatedAt: string;
}

export default function TemplateStudio() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [versions, setVersions] = useState<TemplateVersion[]>([]);
  const [selected, setSelected] = useState<TemplateVersion | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draftDirty, setDraftDirty] = useState(false);
  const [draft, setDraft] = useState<import("../components/desired-state").DesiredState | null>(
    null
  );
  const [resetToken, setResetToken] = useState(0);
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  async function refresh() {
    if (!templateId) return;
    const [templateResponse, versionsResponse] = await Promise.all([
      apiFetch(`/api/templates/${templateId}`),
      apiFetch(`/api/templates/${templateId}/versions`),
    ]);
    if (!templateResponse.ok || !versionsResponse.ok) throw new Error("Failed to refresh template");
    const next = (await templateResponse.json()) as TemplateDetail;
    setTemplate(next);
    setName(next.name);
    setDescription(next.description);
    const nextVersions = (await versionsResponse.json()) as TemplateVersion[];
    setVersions(nextVersions);
    setSelected(nextVersions.find((v) => v.version === next.version) ?? null);
    setDraftDirty(false);
  }
  useEffect(() => {
    void refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    );
  }, [templateId]);
  const authoring = useTemplateAuthoring(templateId, () => {
    if (draftDirty) guarded(() => refresh());
    else void refresh();
  });

  async function saveMetadata() {
    if (!templateId) return;
    const response = await apiFetch(`/api/templates/${templateId}`, {
      method: "PATCH",
      body: { name, description, category: template?.category, tags: template?.tags ?? [] },
    });
    if (response.ok) setTemplate((await response.json()) as TemplateDetail);
  }
  async function saveDraft() {
    if (!draft) return;
    await commitStructure(draft.active);
    setDraft(null);
    setDraftDirty(false);
  }
  async function commitStructure(structure: Record<string, unknown>) {
    if (!templateId || !template) return;
    const response = await apiFetch(`/api/templates/${templateId}/versions`, {
      method: "POST",
      body: { structure, expectedVersion: template.version },
    });
    if (!response.ok) throw new Error("Failed to save structure");
    await refresh();
  }
  async function revert(version: TemplateVersion) {
    if (!templateId || !template) return;
    const response = await apiFetch(
      `/api/templates/${templateId}/versions/${version.version}/revert`,
      { method: "POST", body: { expectedVersion: template.version } }
    );
    if (!response.ok) throw new Error("Failed to revert version");
    await refresh();
  }
  async function fork() {
    if (!templateId) return;
    const response = await apiFetch(`/api/templates/${templateId}/fork`, { method: "POST" });
    if (response.ok)
      navigate(`/templates/${((await response.json()) as { id: string }).id}/studio`);
  }
  async function remove() {
    if (templateId && (await apiFetch(`/api/templates/${templateId}`, { method: "DELETE" })).ok)
      navigate("/templates");
  }
  function guarded(action: () => void | Promise<void>) {
    if (draftDirty) setPendingAction(() => action);
    else void action();
  }
  async function saveAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    await saveDraft();
    await saveMetadata();
    await action?.();
  }
  function discardAndContinue() {
    const action = pendingAction;
    setPendingAction(null);
    setDraft(null);
    setDraftDirty(false);
    setResetToken((value) => value + 1);
    void action?.();
  }

  if (!template)
    return <div className="flex-1 p-8 text-shell-text-muted">{error || "Loading…"}</div>;
  const preview = selected && selected.version !== template.version ? selected : null;
  return (
    <StudioShell
      header={(restoreControls) => (
        <header className="flex items-center gap-2 border-b border-shell-border bg-shell-surface px-4 py-2">
          <Link
            to={`/templates/${template.id}`}
            onClick={(event) => {
              event.preventDefault();
              guarded(() => navigate(`/templates/${template.id}`));
            }}
            aria-label="Back to viewer"
          >
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDraftDirty(true);
              }}
              className="w-full bg-transparent text-base font-semibold text-shell-text outline-none"
            />
            <input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDraftDirty(true);
              }}
              className="w-full bg-transparent text-xs text-shell-text-muted outline-none"
            />
          </div>
          {restoreControls}
          <button type="button" onClick={() => void saveMetadata()} aria-label="Save metadata">
            <Save size={15} />
          </button>
          <button type="button" onClick={() => guarded(fork)} aria-label="Fork template">
            <GitFork size={15} />
          </button>
          <button
            type="button"
            onClick={() => guarded(remove)}
            aria-label="Delete template"
            className="text-error"
          >
            <Trash2 size={15} />
          </button>
        </header>
      )}
      sidebar={
        <WorkspaceSidebar
          guildId={null}
          guildName={null}
          mode="templates"
          contextTitle="Version history"
          onNavigate={(path) => guarded(() => navigate(path))}
        >
          <TemplateVersionHistory
            versions={versions}
            currentVersion={template.version}
            selectedVersion={selected?.version ?? template.version}
            onSelect={(version) => guarded(() => setSelected(version))}
            onRevert={(version) =>
              guarded(() =>
                revert(version).catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : String(err))
                )
              )
            }
          />
        </WorkspaceSidebar>
      }
      rightPanel={
        <TemplatePreview
          key={preview?.version ?? template.version}
          structure={preview?.structure ?? template.structure}
          name={template.name}
          version={preview?.version ?? template.version}
          readOnly={Boolean(preview)}
          resetToken={resetToken}
          onDraftChange={setDraft}
          onDirtyChange={setDraftDirty}
          onSave={async (structure) => {
            await commitStructure(structure);
            setDraft(null);
            setDraftDirty(false);
          }}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-2 border-b border-shell-border bg-shell-surface px-4 py-2">
          <Link
            to={`/templates/${template.id}`}
            onClick={(event) => {
              event.preventDefault();
              guarded(() => navigate(`/templates/${template.id}`));
            }}
            aria-label="Back to viewer"
          >
            <ArrowLeft size={15} />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDraftDirty(true);
              }}
              className="w-full bg-transparent text-base font-semibold text-shell-text outline-none"
            />
            <input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setDraftDirty(true);
              }}
              className="w-full bg-transparent text-xs text-shell-text-muted outline-none"
            />
          </div>
          <button type="button" onClick={() => void saveMetadata()} aria-label="Save metadata">
            <Save size={15} />
          </button>
          <button type="button" onClick={() => guarded(fork)} aria-label="Fork template">
            <GitFork size={15} />
          </button>
          <button
            type="button"
            onClick={() => guarded(remove)}
            aria-label="Delete template"
            className="text-error"
          >
            <Trash2 size={15} />
          </button>
        </header>
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-5 pb-44 pt-6">
            <div className="text-xs text-shell-text-muted">
              Current version {template.version} · {authoring.status}
            </div>
            {authoring.error && <div className="text-sm text-error">{authoring.error}</div>}
            <div className="space-y-3">
              {authoring.turns.map((turn) => (
                <div key={turn.id} className="space-y-2">
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-shell-accent px-4 py-2.5 text-sm text-shell-accent-fg shadow-sm">
                    {turn.prompt}
                  </div>
                  <div className="agent-card max-w-[90%] rounded-xl border border-shell-border bg-shell-surface p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-shell-text-muted">
                      {turn.status}
                    </div>
                    {(turn.summary || turn.error) && (
                      <div
                        className={`mt-2 whitespace-pre-wrap text-sm ${turn.error ? "text-error" : "text-shell-text"}`}
                      >
                        {turn.error ?? turn.summary}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {authoring.activeTurnId && (
                <div className="agent-card max-w-[90%] rounded-xl border border-shell-border bg-shell-surface p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-shell-text-muted">
                    {authoring.status}
                  </div>
                  <details className="mt-3 text-xs text-shell-text-muted">
                    <summary className="cursor-pointer">Activity log</summary>
                    <div className="mt-2 space-y-1 border-l border-shell-border pl-3">
                      {authoring.events.length === 0 ? (
                        <div>Waiting for activity…</div>
                      ) : (
                        authoring.events.map((event, index) => (
                          <div key={index}>
                            {event.type}: {event.toolName ?? "tool"}
                          </div>
                        ))
                      )}
                    </div>
                  </details>
                </div>
              )}
            </div>
            {authoring.question && (
              <div className="rounded border border-shell-accent p-3">
                <div className="text-sm text-shell-text">{authoring.question.question}</div>
                <button
                  type="button"
                  onClick={() => void authoring.answer(authoring.question?.options?.[0] ?? "")}
                  className="mt-2 rounded bg-shell-accent px-3 py-1 text-xs text-shell-accent-fg"
                >
                  Continue
                </button>
              </div>
            )}
            <SharedComposer
              placeholder="Describe a template change…"
              submitLabel="Author"
              inFlight={authoring.status === "planning" || authoring.status === "waiting_for_user"}
              models={authoring.models}
              modelConfig={authoring.modelConfig}
              modelsLoading={authoring.modelsLoading}
              onModelChange={authoring.setModelConfig}
              active={authoring.status === "planning" || authoring.status === "waiting_for_user"}
              clearAfterSubmit
              onSubmit={(value) => guarded(() => authoring.submit(value, authoring.modelConfig))}
            />
            {authoring.activeTurnId && (
              <button
                type="button"
                onClick={() => void authoring.cancel()}
                className="absolute bottom-2 right-8 z-20 text-xs text-error"
              >
                Cancel authoring
              </button>
            )}
          </div>
        </div>
      </div>
      {pendingAction && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-lg border border-shell-border bg-shell-surface p-5 shadow-xl">
            <h2 className="text-sm font-semibold text-shell-text">Unsaved structure changes</h2>
            <p className="mt-2 text-xs text-shell-text-muted">
              Save or discard your local draft before continuing.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-3 py-1.5 text-xs text-shell-text-muted"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={discardAndContinue}
                className="px-3 py-1.5 text-xs text-error"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => void saveAndContinue()}
                className="rounded bg-shell-accent px-3 py-1.5 text-xs text-shell-accent-fg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
