import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitFork, Pencil, Trash2 } from "lucide-react";
import DesiredStateView from "../components/DesiredStateView";
import { apiFetch } from "../lib/api";
import type { DesiredState } from "../components/desired-state";
import StudioShell from "../components/studio/StudioShell";
import WorkspaceSidebar from "../components/studio/WorkspaceSidebar";

interface TemplateDetail {
  id: string;
  version: number;
  name: string;
  description: string;
  structure: Record<string, unknown>;
  authorId: string | null;
  updatedAt: string;
}

function wrapStructure(template: TemplateDetail): DesiredState {
  const structure = template.structure as Partial<DesiredState["active"]>;
  return {
    guildId: "",
    guildName: template.name,
    active: {
      channels: structure.channels ?? {},
      roles: structure.roles ?? {},
      overwrites: structure.overwrites ?? {},
      memberRoles: structure.memberRoles ?? {},
    },
    tombstones: [],
    symbolCounter: 0,
    version: template.version,
  };
}

export default function TemplateViewer() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!templateId) return;
    apiFetch(`/api/templates/${templateId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
        return (await res.json()) as TemplateDetail;
      })
      .then(setTemplate)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [templateId]);

  async function fork() {
    if (!template) return;
    const res = await apiFetch(`/api/templates/${template.id}/fork`, { method: "POST" });
    if (res.ok) {
      const created = (await res.json()) as { id: string };
      navigate(`/templates/${created.id}/studio`);
    }
  }

  async function remove() {
    if (!template) return;
    const res = await apiFetch(`/api/templates/${template.id}`, { method: "DELETE" });
    if (res.ok) navigate("/templates");
  }

  if (error) return <div className="p-8 text-error">{error}</div>;
  if (!template) return <div className="flex-1 p-8 text-shell-text-muted">Loading…</div>;

  return (
    <StudioShell sidebar={<WorkspaceSidebar guildId={null} guildName={null} mode="templates" />}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to="/templates"
                className="inline-flex items-center gap-1 text-sm text-shell-text-muted"
              >
                <ArrowLeft size={14} /> Templates
              </Link>
              <h1 className="mt-2 text-2xl font-semibold text-shell-text">{template.name}</h1>
              {template.description && (
                <p className="mt-1 text-sm text-shell-text-muted">{template.description}</p>
              )}
              <p className="mt-1 text-xs text-shell-text-muted">
                Version {template.version} · Updated{" "}
                {new Date(template.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void fork()}
                className="inline-flex items-center gap-1 border border-shell-border bg-shell-surface2 px-3 py-2 text-sm text-shell-text"
              >
                <GitFork size={14} /> Fork
              </button>
              <Link
                to={`/templates/${template.id}/studio`}
                className="inline-flex items-center gap-1 border border-shell-border bg-shell-surface2 px-3 py-2 text-sm text-shell-text"
              >
                <Pencil size={14} /> Edit
              </Link>
              <button
                onClick={() => void remove()}
                className="inline-flex items-center gap-1 border border-error/40 bg-error/10 px-3 py-2 text-sm text-error"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
          <div className="border border-shell-border bg-shell-canvas p-4">
            <DesiredStateView
              desiredState={wrapStructure(template)}
              showMembers={false}
              showTombstones={false}
            />
          </div>
        </div>
      </div>
    </StudioShell>
  );
}
