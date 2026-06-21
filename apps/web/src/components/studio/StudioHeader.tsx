import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Settings } from "lucide-react";
import { useGuildName } from "../../hooks/useGuildName";

/**
 * Contextual header for the Studio route. Renders below the top-level
 * AppHeader and shows the active guild with a back-to-picker affordance.
 */
export default function StudioHeader() {
  const { guildId } = useParams<{ guildId: string }>();
  const guildName = useGuildName(guildId);

  return (
    <div className="h-12 shrink-0 border-b border-shell-border bg-shell-surface flex items-center px-4 gap-3">
      {guildId ? (
        <Link
          to="/studio"
          className="inline-flex items-center gap-2 text-shell-text-muted hover:text-shell-text transition-colors group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
          <span className="text-sm">Pick a server</span>
        </Link>
      ) : (
        <span className="text-sm text-shell-text-muted">Studio</span>
      )}

      {guildId && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-shell-text-subtle text-xs">/</span>
          <span className="text-shell-text font-medium text-sm truncate">
            {guildName ?? guildId}
          </span>
        </div>
      )}

      <div className="flex-1" />

      {guildId && (
        <div className="flex items-center gap-1">
          <Link
            to={`/templates/${guildId}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded text-xs transition-colors"
          >
            <FileText size={13} />
            Templates
          </Link>
          <Link
            to={`/dashboard/${guildId}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-shell-text-muted hover:text-shell-text hover:bg-shell-surface2 rounded text-xs transition-colors"
          >
            <Settings size={13} />
            Settings
          </Link>
        </div>
      )}
    </div>
  );
}
