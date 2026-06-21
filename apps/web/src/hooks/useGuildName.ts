import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

/**
 * Resolves a guild id to its display name. Returns null while loading
 * or on error; the caller should fall back to the id for display.
 */
export function useGuildName(guildId: string | undefined): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!guildId) {
      setName(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/guilds/${guildId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { name?: string } | null) => {
        if (!cancelled && data?.name) setName(data.name);
      })
      .catch(() => {
        /* swallow — name stays null and the caller falls back to the id */
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return name;
}
