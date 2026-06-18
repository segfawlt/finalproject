import type { MemberRoleAssignment, DiffStatus } from "./types";
import MemberItem from "./MemberItem";

interface MemberListProps {
  assignments: MemberRoleAssignment[];
  roleNames?: Record<string, string>;
  /** Optional diff map keyed by member id. */
  diffs?: Map<string, DiffStatus>;
  /** Fallback diff status for items not present in `diffs`. */
  defaultDiffStatus?: DiffStatus;
  /** Read-only section; flag is passed through to children. */
  editing?: boolean;
}

export default function MemberList({
  assignments,
  roleNames,
  diffs,
  defaultDiffStatus,
  editing,
}: MemberListProps) {
  if (assignments.length === 0) {
    return <div className="text-gray-500 text-xs italic">No member role assignments</div>;
  }
  return (
    <ul className="space-y-1">
      {assignments.map((a) => (
        <MemberItem
          key={a.memberId}
          assignment={a}
          roleNames={roleNames}
          diffStatus={diffs?.get(a.memberId) ?? defaultDiffStatus}
          editing={editing}
        />
      ))}
    </ul>
  );
}
