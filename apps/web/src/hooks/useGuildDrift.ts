import { useEffect, useState } from "react";
import { useStudioStore } from "../stores/studioStore";
import { parseSseData } from "../lib/sse";

export type DriftSeverity = "info" | "warning" | "critical";

export interface DriftEvent {
  guildId: string;
  severity: DriftSeverity;
  kind: string;
  summary: string;
  details: Record<string, unknown>;
  detectedAt: string;
}

/**
 * Subscribes to /api/guilds/:guildId/drift/stream. When a drift
 * event arrives, the latest one is exposed for the toast indicator
 * and the per-guild `stale` flag is flipped in the store so the
 * Approve button can lock out.
 *
 * Calling `dismiss()` clears the visible event and the stale flag.
 */
export function useGuildDrift(guildId: string | undefined) {
  const [event, setEvent] = useState<DriftEvent | null>(null);
  const markStale = useStudioStore((s) => s.markStale);

  useEffect(() => {
    if (!guildId) return;
    let cancelled = false;
    const es = new EventSource(`/api/guilds/${guildId}/drift/stream`);

    es.addEventListener("ready", () => {
      /* stream ready — no-op */
    });

    es.addEventListener("drift", (e) => {
      const data = parseSseData<DriftEvent>(e);
      if (!data || data.guildId !== guildId) return;
      if (cancelled) return;
      setEvent(data);
      markStale(guildId, true);
    });

    return () => {
      cancelled = true;
      es.close();
    };
  }, [guildId, markStale]);

  function dismiss() {
    if (!guildId) return;
    setEvent(null);
    markStale(guildId, false);
  }

  return { event, dismiss };
}
