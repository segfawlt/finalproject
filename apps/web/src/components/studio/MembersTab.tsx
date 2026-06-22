import { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { type MemberRoleAssignment, type Role } from "../desired-state/types";
import { MemberList } from "../desired-state";

interface MembersTabProps {
  guildId: string;
}

interface StateResponse {
  roles: Role[];
  memberRoles?: MemberRoleAssignment[];
}

/**
 * Member role assignments for the active guild. Fetches the full
 * server state once and renders members grouped by role via the
 * existing MemberList.
 */
export default function MembersTab({ guildId }: MembersTabProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<MemberRoleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StateResponse | null) => {
        if (cancelled) return;
        setRoles(data?.roles ?? []);
        setMembers(data?.memberRoles ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  const roleNames: Record<string, string> = {};
  for (const r of roles) roleNames[r.id] = r.name;

  return (
    <div className="p-4 space-y-3">
      <header>
        <h2 className="text-shell-text font-semibold text-sm">Members</h2>
        <p className="text-shell-text-muted text-xs">
          {loading ? "Loading…" : `${members.length} assignment${members.length === 1 ? "" : "s"}`}
        </p>
      </header>
      {loading ? (
        <div className="flex items-center gap-2 text-shell-text-muted text-xs">
          <Loader size={12} className="animate-spin" />
          Loading…
        </div>
      ) : error ? (
        <div className="text-error text-sm">{error}</div>
      ) : (
        <MemberList assignments={members} roleNames={roleNames} />
      )}
    </div>
  );
}
