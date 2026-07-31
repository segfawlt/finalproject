import { User } from "lucide-react";
import DiffBadge from "./DiffBadge";
import type { MemberRoleAssignment, DiffStatus } from "./types";

interface MemberItemProps {
  assignment: MemberRoleAssignment;
  /** Optional id → name lookup for nicer rendering. */
  roleNames?: Record<string, string>;
  diffStatus?: DiffStatus;
  /**
   * Read-only in v1. When true, an explicit "read-only" badge is shown so
   * users know the editor is intentionally not letting them change it.
   */
  editing?: boolean;
}

export default function MemberItem({
  assignment,
  roleNames,
  diffStatus,
  editing,
}: MemberItemProps) {
  const names =
    roleNames && assignment.roleIds.length > 0
      ? assignment.roleIds.map((id) => roleNames[id] ?? id)
      : assignment.roleIds;
  return (
    <li className="px-3 py-2 bg-shell-surface2 border border-shell-border rounded text-sm flex items-center gap-2">
      <User size={14} className="text-shell-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-shell-text font-mono text-xs">{assignment.memberId}</span>
          <span className="text-shell-text-muted text-xs">
            → {assignment.roleIds.length} role(s)
          </span>
          {editing && (
            <span className="text-shell-text-muted text-[10px] uppercase tracking-wide border border-shell-border rounded px-1.5">
              read-only
            </span>
          )}
          {diffStatus && <DiffBadge status={diffStatus} />}
        </div>
        {names.length > 0 && (
          <div className="text-shell-text-muted text-xs mt-1">{names.join(", ")}</div>
        )}
      </div>
    </li>
  );
}
