import { Link, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { ArrowLeft, History, Settings } from "lucide-react";
import { useGuildName } from "../../hooks/useGuildName";

/**
 * Contextual header for the Studio route. Renders below the top-level
 * AppHeader and shows the active guild with a back-to-picker affordance.
 */
export default function StudioHeader({
  onOpenSettings,
  onOpenHistory,
  historyCount = 0,
}: {
  onOpenSettings?: () => void;
  onOpenHistory?: () => void;
  historyCount?: number;
}) {
  const { guildId } = useParams<{ guildId: string }>();
  const guildName = useGuildName(guildId);

  return (
    <div className="h-14 shrink-0 border-b border-shell-border bg-black flex items-center px-6 gap-4">
      {guildId ? (
        <Link
          to="/studio"
          className="inline-flex items-center gap-2 text-shell-text-muted hover:text-shell-text transition-colors group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm">Pick a server</span>
        </Link>
      ) : (
        <span className="text-sm font-semibold tracking-tight text-shell-text">Studio</span>
      )}

      {guildId && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-shell-text-subtle text-xs">/</span>
          <span className="text-shell-text font-semibold text-sm truncate">
            {guildName ?? guildId}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {onOpenHistory && (
          <button
            type="button"
            onClick={onOpenHistory}
            disabled={historyCount === 0}
            className="inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs text-shell-text-muted transition-colors hover:bg-shell-surface2 hover:text-shell-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <History size={13} />
            History{historyCount > 0 ? ` (${historyCount})` : ""}
          </button>
        )}
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded text-xs transition-colors"
        >
          <Settings size={13} />
          Settings
        </button>
      </div>
    </div>
  );
}
