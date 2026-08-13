import { useMemo } from "react";
import { Plus } from "lucide-react";
import type { Role, DiffStatus } from "./types";
import RoleItem from "./RoleItem";

interface RoleListProps {
  roles: Role[];
  /** Optional diff map keyed by role id. */
  diffs?: Map<string, DiffStatus>;
  /** Fallback diff status for items not present in `diffs`. */
  defaultDiffStatus?: DiffStatus;
  diffVersion?: number;
  editing?: boolean;
  onChange?: (id: string, next: Role) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
}

export default function RoleList({
  roles,
  diffs,
  defaultDiffStatus,
  diffVersion,
  editing,
  onChange,
  onDelete,
  onAdd,
}: RoleListProps) {
  /** Discord displays higher position = higher in the role list. */
  const sorted = useMemo(() => [...roles].sort((a, b) => b.position - a.position), [roles]);
  if (sorted.length === 0 && !editing) {
    return <div className="text-gray-500 text-xs italic">No roles</div>;
  }
  return (
    <div className="space-y-1">
      {editing && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border border-dashed border-shell-border rounded text-xs text-shell-text-muted hover:text-shell-text hover:border-shell-accent transition"
        >
          <Plus size={12} /> Add role
        </button>
      )}
      {sorted.length > 0 && (
        <ul className="space-y-1">
          {sorted.map((r) => (
            <RoleItem
              key={r.id}
              role={r}
              diffStatus={
                diffs?.get(r.id) ?? defaultDiffStatus ?? (r.id.startsWith("$") ? "new" : undefined)
              }
              diffVersion={diffVersion}
              editing={editing}
              onChange={onChange ? (next) => onChange(r.id, next) : undefined}
              onDelete={onDelete ? () => onDelete(r.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
