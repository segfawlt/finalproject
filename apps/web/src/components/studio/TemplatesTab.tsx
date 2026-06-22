import { Link } from "react-router-dom";
import { Library } from "lucide-react";

interface TemplatesTabProps {
  guildId: string;
}

/**
 * Stub for the in-app template browser. The full library lives
 * at /templates/:guildId; this tab is a placeholder until the
 * rich browser is built (browse/search/merge).
 */
export default function TemplatesTab({ guildId }: TemplatesTabProps) {
  return (
    <div className="p-4 space-y-3">
      <header>
        <h2 className="text-shell-text font-semibold text-sm flex items-center gap-2">
          <Library size={14} />
          Templates
        </h2>
        <p className="text-shell-text-muted text-xs">
          Per-server template library (coming soon).
        </p>
      </header>
      <div className="rounded-md border border-dashed border-shell-border p-4 text-center">
        <p className="text-shell-text-muted text-sm">
          The in-app browser lands in a later phase.
        </p>
        <Link
          to={`/templates/${guildId}`}
          className="mt-3 inline-block text-shell-text-link text-xs hover:underline"
        >
          Open the full library →
        </Link>
      </div>
    </div>
  );
}
