import { Shield } from "lucide-react";
import DiffBadge from "./DiffBadge";
import type { Role, DiffStatus } from "./types";
import { roleColorHex } from "./types";

interface RoleItemProps {
  role: Role;
  diffStatus?: DiffStatus;
  editing?: boolean;
  onChange?: (next: Role) => void;
  onDelete?: () => void;
}

/** Parse a `#rrggbb` (or `rrggbb`) hex string into the 24-bit int Discord uses. */
function parseHexColor(input: string): number {
  const trimmed = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{1,6}$/.test(trimmed)) return 0;
  return parseInt(trimmed.padEnd(6, "0"), 16);
}

export default function RoleItem({ role, diffStatus, editing, onChange, onDelete }: RoleItemProps) {
  if (editing) {
    return (
      <li className="px-3 py-2 bg-discord-bg-secondary border border-discord-divider rounded text-sm flex items-center gap-2">
        <Shield size={14} className="text-discord-text-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              aria-label="Role name"
              value={role.name}
              onChange={(e) => onChange?.({ ...role, name: e.target.value })}
              className="px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-sm min-w-0 flex-1"
            />
            <label className="text-discord-text-muted text-xs flex items-center gap-1">
              pos
              <input
                aria-label="Role position"
                type="number"
                value={role.position}
                onChange={(e) => onChange?.({ ...role, position: Number(e.target.value) || 0 })}
                className="w-16 px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-xs"
              />
            </label>
            <label className="text-discord-text-muted text-xs flex items-center gap-1">
              color
              <input
                aria-label="Role color"
                type="text"
                value={roleColorHex(role.color)}
                onChange={(e) => onChange?.({ ...role, color: parseHexColor(e.target.value) })}
                className="w-20 px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-xs font-mono"
              />
            </label>
            {onDelete && (
              <button
                type="button"
                aria-label="Delete role"
                onClick={onDelete}
                className="px-1.5 py-1 rounded text-discord-red hover:bg-discord-red/20 text-xs"
              >
                ×
              </button>
            )}
          </div>
          <div className="text-discord-text-muted text-xs">id: {role.id}</div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-2 bg-discord-bg-secondary border border-discord-divider rounded text-sm flex items-center gap-2">
      <Shield size={14} className="text-discord-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-discord-text font-medium">{role.name}</span>
          <span className="text-discord-text-muted text-xs">pos {role.position}</span>
          <span className="text-discord-text-muted text-xs font-mono">
            {roleColorHex(role.color)}
          </span>
          {role.hoist && <span className="text-discord-yellow text-xs">hoist</span>}
          {role.mentionable && <span className="text-discord-text-link text-xs">mentionable</span>}
          {diffStatus && <DiffBadge status={diffStatus} />}
        </div>
        {role.permissions.length > 0 && (
          <div className="text-discord-text-muted text-xs mt-1 truncate">
            perms: {role.permissions.join(", ")}
          </div>
        )}
        <div className="text-discord-text-muted text-xs">id: {role.id}</div>
      </div>
    </li>
  );
}
