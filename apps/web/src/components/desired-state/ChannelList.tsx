import { useMemo } from "react";
import { Plus } from "lucide-react";
import type { ChannelBase, DiffStatus } from "./types";
import ChannelItem from "./ChannelItem";

interface ChannelListProps {
  channels: ChannelBase[];
  /** Lookup from category id → name, for showing the parent of each channel. */
  categoryNames: Record<string, string>;
  /** Optional diff map keyed by channel id. */
  diffs?: Map<string, DiffStatus>;
  /** Fallback diff status for items not present in `diffs`. */
  defaultDiffStatus?: DiffStatus;
  editing?: boolean;
  onChange?: (id: string, next: ChannelBase) => void;
  onDelete?: (id: string) => void;
  onAdd?: () => void;
  /** When provided, each read-only row is clickable and fires with the channel. */
  onClick?: (channel: ChannelBase) => void;
}

export default function ChannelList({
  channels,
  categoryNames,
  diffs,
  defaultDiffStatus,
  editing,
  onChange,
  onDelete,
  onAdd,
  onClick,
}: ChannelListProps) {
  const sorted = useMemo(() => [...channels].sort((a, b) => a.position - b.position), [channels]);
  if (sorted.length === 0 && !editing) {
    return <div className="text-gray-500 text-xs italic">No channels</div>;
  }
  return (
    <div className="space-y-1">
      {editing && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 border border-dashed border-discord-divider rounded text-xs text-discord-text-muted hover:text-discord-text hover:border-discord-accent transition"
        >
          <Plus size={12} /> Add channel
        </button>
      )}
      {sorted.length > 0 && (
        <ul className="space-y-1">
          {sorted.map((c) => (
            <ChannelItem
              key={c.id}
              channel={c}
              parentName={c.parentId ? (categoryNames[c.parentId] ?? null) : null}
              diffStatus={diffs?.get(c.id) ?? defaultDiffStatus}
              editing={editing}
              onChange={onChange ? (next) => onChange(c.id, next) : undefined}
              onDelete={onDelete ? () => onDelete(c.id) : undefined}
              onClick={onClick ? () => onClick(c) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
