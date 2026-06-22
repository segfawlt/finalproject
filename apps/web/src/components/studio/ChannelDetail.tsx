import { useMemo } from "react";
import {
  Hash,
  Volume2,
  Megaphone,
  Mic2,
  Newspaper,
  Tv,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import {
  channelTypeLabel,
  type ChannelBase,
  type PermissionOverwrite,
  type Role,
} from "../desired-state/types";

interface ChannelDetailProps {
  channel: ChannelBase;
  /** All overwrites in the same source. The component filters to this channel. */
  overwrites: PermissionOverwrite[];
  /** Used to label parent + role names. */
  roles: Role[];
  /** Used to label the parent category, if any. */
  categoryName?: string;
}

const CHANNEL_ICONS: Record<number, LucideIcon> = {
  0: Hash,
  2: Volume2,
  4: Hash,
  5: Megaphone,
  13: Mic2,
  15: Newspaper,
  16: Tv,
};

const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: "Text",
  2: "Voice",
  4: "Category",
  5: "Announcement",
  13: "Stage",
  15: "Forum",
  16: "Media",
};

/**
 * Detailed view of a single channel — header, settings grid, and
 * the permission overwrites table. Type-conditional: bitrate /
 * user limit only render for voice, forum tags / layout for
 * forums, etc.
 */
export default function ChannelDetail({
  channel,
  overwrites,
  roles,
  categoryName,
}: ChannelDetailProps) {
  const typeLabel = channelTypeLabel(channel.type);
  const displayLabel = CHANNEL_TYPE_LABEL[channel.type] ?? typeLabel;
  const Icon = CHANNEL_ICONS[channel.type] ?? MessageSquare;

  const roleNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of roles) map[r.id] = r.name;
    return map;
  }, [roles]);

  const channelOverwrites = useMemo(
    () => overwrites.filter((o) => o.channelId === channel.id),
    [overwrites, channel.id]
  );

  const isVoice = channel.type === 2 || channel.type === 13;
  const isForum = channel.type === 15 || channel.type === 16;

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-shell-surface2 border border-shell-border flex items-center justify-center shrink-0">
          <Icon size={16} className="text-shell-text-muted" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-shell-text-muted font-semibold">
            {displayLabel} channel
          </div>
          <h2 className="text-shell-text font-semibold text-sm truncate">#{channel.name}</h2>
        </div>
      </header>

      {/* Settings grid */}
      <Section title="Settings">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Row label="Type">{displayLabel}</Row>
          {channel.parentId && categoryName && <Row label="Category">{categoryName}</Row>}
          <Row label="Position">{channel.position}</Row>
          {channel.topic != null && channel.topic !== "" && (
            <Row label="Topic" wide>
              <span className="text-shell-text">{channel.topic}</span>
            </Row>
          )}
          {channel.rateLimitPerUser != null && channel.rateLimitPerUser > 0 && (
            <Row label="Slow mode">{channel.rateLimitPerUser}s</Row>
          )}
          {channel.nsfw === true && <Row label="NSFW">Yes</Row>}
          {isVoice && channel.bitrate != null && (
            <Row label="Bitrate">{Math.round(channel.bitrate / 1000)} kbps</Row>
          )}
          {isVoice && channel.userLimit != null && channel.userLimit > 0 && (
            <Row label="User limit">{channel.userLimit}</Row>
          )}
          {isForum && channel.defaultForumLayout != null && (
            <Row label="Forum layout">{forumLayoutLabel(channel.defaultForumLayout)}</Row>
          )}
          {isForum && channel.defaultThreadRateLimitPerUser != null && (
            <Row label="Thread slow mode">{channel.defaultThreadRateLimitPerUser}s</Row>
          )}
          {isForum && channel.defaultSortOrder != null && (
            <Row label="Default sort order">
              {channel.defaultSortOrder === 1 ? "Latest activity" : "Creation date"}
            </Row>
          )}
          {channel.lockPermissions === false && (
            <Row label="Permissions">Unsynced from category</Row>
          )}
        </dl>
      </Section>

      {/* Forum tags */}
      {isForum && channel.availableTags && channel.availableTags.length > 0 && (
        <Section title={`Tags (${channel.availableTags.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {channel.availableTags.map((tag, i) => (
              <span
                key={`${tag.name}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-shell-surface2 text-shell-text text-[11px] rounded border border-shell-border"
              >
                {tag.emojiName ?? tag.emojiId ?? ""}
                {tag.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Permission overwrites */}
      <Section title={`Permission overwrites (${channelOverwrites.length})`}>
        {channelOverwrites.length === 0 ? (
          <div className="text-shell-text-muted text-xs italic">
            Inherits from {channel.parentId ? "category" : "@everyone"}.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-shell-text-subtle">
                <th className="text-left font-semibold py-1">Role</th>
                <th className="text-left font-semibold py-1">Allow</th>
                <th className="text-left font-semibold py-1">Deny</th>
              </tr>
            </thead>
            <tbody>
              {channelOverwrites.map((o) => (
                <tr key={`${o.channelId}-${o.roleId}`} className="border-t border-shell-border">
                  <td className="py-1.5 text-shell-text">
                    {o.roleId === "@everyone" || roleNameById[o.roleId] === "@everyone"
                      ? "@everyone"
                      : `@${roleNameById[o.roleId] ?? o.roleId}`}
                  </td>
                  <td className="py-1.5 text-shell-text-muted">
                    {o.allow.length === 0 ? "—" : o.allow.join(", ")}
                  </td>
                  <td className="py-1.5 text-shell-text-muted">
                    {o.deny.length === 0 ? "—" : o.deny.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] uppercase tracking-wider font-semibold text-shell-text-subtle mb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-shell-text-subtle text-[10px] uppercase tracking-wider">{label}</dt>
      <dd className="text-shell-text-muted mt-0.5">{children}</dd>
    </div>
  );
}

function forumLayoutLabel(layout: number): string {
  switch (layout) {
    case 0:
      return "Not set";
    case 1:
      return "List view";
    case 2:
      return "Gallery view";
    default:
      return `layout_${layout}`;
  }
}
