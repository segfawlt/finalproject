import { Hash, Volume2, Megaphone, MonitorPlay, MessagesSquare, Image } from "lucide-react";
import DiffBadge from "./DiffBadge";
import type { ChannelBase, DiffStatus } from "./types";
import { channelTypeLabel } from "./types";

interface ChannelItemProps {
  channel: ChannelBase;
  /** Looked-up category name for the parent, if any. */
  parentName?: string | null;
  diffStatus?: DiffStatus;
  /**
   * When true, swap read-only name/type/position displays for inline inputs.
   * `onChange` propagates the modified channel back to the parent. The parent
   * is responsible for splicing the change into its own state tree.
   */
  editing?: boolean;
  onChange?: (next: ChannelBase) => void;
  onDelete?: () => void;
  /** When provided, the read-only row is clickable. */
  onClick?: () => void;
}

function channelTypeIcon(type: number) {
  switch (type) {
    case 0:
      return Hash;
    case 2:
      return Volume2;
    case 5:
      return Megaphone;
    case 13:
      return MonitorPlay;
    case 15:
      return MessagesSquare;
    case 16:
      return Image;
    default:
      return Hash;
  }
}

const EDITABLE_CHANNEL_TYPES: Array<{ value: number; label: string }> = [
  { value: 0, label: "text" },
  { value: 2, label: "voice" },
  { value: 5, label: "announcement" },
  { value: 13, label: "stage" },
  { value: 15, label: "forum" },
];

export default function ChannelItem({
  channel,
  parentName,
  diffStatus,
  editing,
  onChange,
  onDelete,
  onClick,
}: ChannelItemProps) {
  const Icon = channelTypeIcon(channel.type);

  if (editing) {
    return (
      <li className="px-3 py-2 bg-discord-bg-secondary border border-discord-divider rounded text-sm flex items-center gap-2">
        <Icon size={14} className="text-discord-text-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              aria-label="Channel name"
              value={channel.name}
              onChange={(e) => onChange?.({ ...channel, name: e.target.value })}
              className="px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-sm min-w-0 flex-1"
            />
            <select
              aria-label="Channel type"
              value={channel.type}
              onChange={(e) => onChange?.({ ...channel, type: Number(e.target.value) })}
              className="px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-xs"
            >
              {EDITABLE_CHANNEL_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <label className="text-discord-text-muted text-xs flex items-center gap-1">
              pos
              <input
                aria-label="Channel position"
                type="number"
                value={channel.position}
                onChange={(e) => onChange?.({ ...channel, position: Number(e.target.value) || 0 })}
                className="w-16 px-2 py-1 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-xs"
              />
            </label>
            {onDelete && (
              <button
                type="button"
                aria-label="Delete channel"
                onClick={onDelete}
                className="px-1.5 py-1 rounded text-discord-red hover:bg-discord-red/20 text-xs"
              >
                ×
              </button>
            )}
          </div>
          <div className="text-discord-text-muted text-xs">id: {channel.id}</div>
        </div>
      </li>
    );
  }

  return (
    <li
      onClick={onClick}
      className={`px-3 py-2 bg-discord-bg-secondary border border-discord-divider rounded text-sm flex items-center gap-2 ${
        onClick
          ? "cursor-pointer hover:border-discord-accent hover:bg-discord-channel-hover transition"
          : ""
      }`}
    >
      <Icon size={14} className="text-discord-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-discord-text font-medium">#{channel.name}</span>
          <span className="text-discord-text-muted text-xs">{channelTypeLabel(channel.type)}</span>
          <span className="text-discord-text-muted text-xs">pos {channel.position}</span>
          {parentName && <span className="text-discord-text-muted text-xs">in {parentName}</span>}
          {channel.nsfw && <span className="text-discord-red text-xs">NSFW</span>}
          {diffStatus && <DiffBadge status={diffStatus} />}
        </div>
        {channel.topic && (
          <div className="text-discord-text-muted text-xs mt-1 truncate">{channel.topic}</div>
        )}
        <div className="text-discord-text-muted text-xs">id: {channel.id}</div>
      </div>
    </li>
  );
}
