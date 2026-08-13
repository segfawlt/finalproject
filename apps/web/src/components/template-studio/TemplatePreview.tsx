import { useEffect } from "react";
import DesiredStateView from "../DesiredStateView";
import { useDesiredStateEdit } from "../../hooks/useDesiredStateEdit";
import type { DesiredState } from "../desired-state";

export function toTemplateDesiredState(
  structure: Record<string, unknown>,
  name: string,
  version: number
): DesiredState {
  const active = structure as Partial<DesiredState["active"]>;
  return {
    guildId: "",
    guildName: name,
    active: {
      channels: active.channels ?? {},
      roles: active.roles ?? {},
      overwrites: active.overwrites ?? {},
      memberRoles: active.memberRoles ?? {},
    },
    tombstones: [],
    symbolCounter: 0,
    version,
  };
}

export default function TemplatePreview({
  structure,
  name,
  version,
  readOnly = false,
  onSave,
  onDirtyChange,
  onDraftChange,
  resetToken,
}: {
  structure: Record<string, unknown>;
  name: string;
  version: number;
  readOnly?: boolean;
  onSave?: (structure: DesiredState["active"]) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onDraftChange?: (draft: DesiredState | null) => void;
  resetToken?: number;
}) {
  const edit = useDesiredStateEdit();
  const state = edit.editableState ?? toTemplateDesiredState(structure, name, version);
  useEffect(() => {
    onDraftChange?.(edit.editableState);
  }, [edit.editableState, onDraftChange]);
  useEffect(() => {
    if (edit.editing) edit.cancelEdit();
  }, [resetToken]);
  async function save() {
    if (edit.editableState && onSave) {
      await onSave(edit.editableState.active);
      edit.finishEdit();
    }
  }
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-shell-text">Structure preview</h2>
        {!readOnly &&
          (edit.editing ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  edit.cancelEdit();
                  onDirtyChange?.(false);
                }}
                className="text-xs text-shell-text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                className="rounded bg-shell-accent px-3 py-1.5 text-xs text-shell-accent-fg"
              >
                Save structure
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                edit.beginEdit(toTemplateDesiredState(structure, name, version));
                onDirtyChange?.(true);
              }}
              className="rounded border border-shell-border px-3 py-1.5 text-xs text-shell-text"
            >
              Edit structure
            </button>
          ))}
      </div>
      <DesiredStateView
        desiredState={state}
        editing={!readOnly && edit.editing}
        showMembers={false}
        showTombstones={false}
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
  );
}
