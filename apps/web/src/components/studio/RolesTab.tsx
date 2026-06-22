import { useEffect, useState } from "react";
import { Loader } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { type Role } from "../desired-state/types";
import { RoleList } from "../desired-state";

interface RolesTabProps {
  guildId: string;
}

/**
 * Server-wide role list. Fetches the current Discord roles and
 * renders them with the same RoleList used in the desired-state
 * preview, so the visual language stays consistent.
 */
export default function RolesTab({ guildId }: RolesTabProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch(`/api/guilds/${guildId}/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { roles?: Role[] } | null) => {
        if (cancelled) return;
        setRoles(data?.roles ?? []);
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

  return (
    <div className="p-4 space-y-3">
      <header>
        <h2 className="text-shell-text font-semibold text-sm">Roles</h2>
        <p className="text-shell-text-muted text-xs">
          {loading ? "Loading…" : `${roles.length} role${roles.length === 1 ? "" : "s"}`}
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
        <RoleList roles={roles} />
      )}
    </div>
  );
}
