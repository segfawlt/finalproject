import { Folder } from "lucide-react";
import DiffBadge from "./DiffBadge";
import type { ChannelBase, DiffStatus } from "./types";

interface CategoryItemProps {
  channel: ChannelBase;
  diffStatus?: DiffStatus;
  diffVersion?: number;
  editing?: boolean;
  onChange?: (next: ChannelBase) => void;
  onDelete?: () => void;
}

export default function CategoryItem({
  channel,
  diffStatus,
  diffVersion,
  editing,
  onChange,
  onDelete,
}: CategoryItemProps) {
  if (editing) {
    return (
      <li className="px-3 py-2 bg-shell-surface2 border border-shell-border rounded text-sm flex items-center gap-2">
        <Folder size={14} className="text-shell-text-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              aria-label="Category name"
              value={channel.name}
              onChange={(e) => onChange?.({ ...channel, name: e.target.value })}
              className="px-2 py-1 rounded bg-shell-canvas text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none text-sm min-w-0 flex-1"
            />
            <label className="text-shell-text-muted text-xs flex items-center gap-1">
              pos
              <input
                aria-label="Category position"
                type="number"
                value={channel.position}
                onChange={(e) => onChange?.({ ...channel, position: Number(e.target.value) || 0 })}
                className="w-16 px-2 py-1 rounded bg-shell-canvas text-shell-text border border-shell-border focus:border-shell-accent focus:outline-none text-xs"
              />
            </label>
            {onDelete && (
              <button
                type="button"
                aria-label="Delete category"
                onClick={onDelete}
                className="px-1.5 py-1 rounded text-error hover:bg-error/20 text-xs"
              >
                ×
              </button>
            )}
          </div>
          <div className="text-shell-text-muted text-xs">id: {channel.id}</div>
        </div>
      </li>
    );
  }

  return (
    <li className="px-3 py-2 bg-shell-surface2 border border-shell-border rounded text-sm flex items-center gap-2">
      <Folder size={14} className="text-shell-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-shell-text font-medium">{channel.name}</span>
          <span className="text-shell-text-muted text-xs">pos {channel.position}</span>
          {channel.lockPermissions !== undefined && (
            <span className="text-shell-text-muted text-xs">
              {channel.lockPermissions ? "locked" : "unlocked"}
            </span>
          )}
          {diffStatus && <DiffBadge status={diffStatus} version={diffVersion} />}
        </div>
        <div className="text-shell-text-muted text-xs">id: {channel.id}</div>
      </div>
    </li>
  );
}
