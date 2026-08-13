import { RotateCcw } from "lucide-react";

export interface TemplateVersion {
  id: string;
  version: number;
  source: string;
  createdAt: string;
  structure: Record<string, unknown>;
}

export default function TemplateVersionHistory({
  versions,
  currentVersion,
  selectedVersion,
  onSelect,
  onRevert,
}: {
  versions: TemplateVersion[];
  currentVersion: number;
  selectedVersion: number;
  onSelect: (version: TemplateVersion) => void;
  onRevert: (version: TemplateVersion) => void;
}) {
  return (
    <div className="space-y-1">
      {[...versions]
        .sort((a, b) => b.version - a.version)
        .map((version) => (
          <div
            key={version.id}
            className={`rounded-md ${selectedVersion === version.version ? "bg-shell-surface3" : ""}`}
          >
            <button
              type="button"
              onClick={() => onSelect(version)}
              className="w-full px-3 py-2 text-left text-sm text-shell-text"
            >
              <div className="flex justify-between">
                <span>Version {version.version}</span>
                {version.version === currentVersion && (
                  <span className="text-xs text-shell-accent">current</span>
                )}
              </div>
              <div className="mt-1 text-xs text-shell-text-muted">
                {version.source} · {new Date(version.createdAt).toLocaleDateString()}
              </div>
            </button>
            {selectedVersion === version.version && version.version !== currentVersion && (
              <button
                type="button"
                onClick={() => onRevert(version)}
                className="mx-3 mb-2 inline-flex items-center gap-1 text-xs text-shell-text-link"
              >
                <RotateCcw size={12} /> Revert to this version
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
