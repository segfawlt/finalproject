import { Trash2 } from "lucide-react";
import type { Tombstone } from "./types";

interface TombstoneListProps {
  tombstones: Tombstone[];
}

export default function TombstoneList({ tombstones }: TombstoneListProps) {
  if (tombstones.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-1">
      {tombstones.map((t) => (
        <li
          key={t.discordId}
          className="px-3 py-2 bg-red-950/40 border-l-4 border-discord-red rounded text-sm flex items-center gap-2"
        >
          <Trash2 size={14} className="text-discord-red shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-red-200 line-through font-medium">{t.name}</span>
              <span className="text-discord-red text-xs">{t.resourceType}</span>
              <span className="text-red-500 text-xs">v{t.deletedInVersion}</span>
            </div>
            <div className="text-red-500 text-xs font-mono">id: {t.discordId}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
