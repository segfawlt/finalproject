import type { Client, Guild } from "discord.js";

interface DriftSubscriber {
  (event: DriftEvent): void;
}

export type DriftSeverity = "info" | "warning" | "critical";

export interface DriftEvent {
  guildId: string;
  severity: DriftSeverity;
  kind: string;
  summary: string;
  details: Record<string, unknown>;
  detectedAt: string;
}

const subscribers = new Map<string, Set<DriftSubscriber>>();

export function subscribeToGuildDrift(guildId: string, callback: DriftSubscriber): () => void {
  if (!subscribers.has(guildId)) {
    subscribers.set(guildId, new Set());
  }
  subscribers.get(guildId)!.add(callback);

  return () => {
    subscribers.get(guildId)?.delete(callback);
    if (subscribers.get(guildId)?.size === 0) {
      subscribers.delete(guildId);
    }
  };
}

export function emitDriftEvent(event: DriftEvent): void {
  const subs = subscribers.get(event.guildId);
  if (!subs) return;
  for (const callback of subs) {
    try {
      callback(event);
    } catch {
      subs.delete(callback);
    }
  }
}

export interface DriftCheckInput {
  guildId: string;
  cache: {
    channels: {
      id: string;
      name: string;
      type: number;
      parentId: string | null;
      position: number;
    }[];
    roles: { id: string; name: string; position: number }[];
  };
  live: {
    channels: {
      id: string;
      name: string;
      type: number;
      parentId: string | null;
      position: number;
    }[];
    roles: { id: string; name: string; position: number }[];
  };
}

/**
 * Compare the in-memory cache against a fresh Discord snapshot and return
 * a list of drift findings. Pure function — caller decides what to do with
 * the results (persist, emit, surface in UI).
 */
export function detectDrift(input: DriftCheckInput): DriftEvent[] {
  const events: DriftEvent[] = [];
  const now = new Date().toISOString();

  const cacheChannels = new Map(input.cache.channels.map((c) => [c.id, c]));
  const liveChannels = new Map(input.live.channels.map((c) => [c.id, c]));

  for (const [id, live] of liveChannels) {
    const cached = cacheChannels.get(id);
    if (!cached) {
      events.push({
        guildId: input.guildId,
        severity: "warning",
        kind: "channel_missing_from_cache",
        summary: `Channel "${live.name}" exists in Discord but is missing from cache.`,
        details: { channelId: id, name: live.name, type: live.type },
        detectedAt: now,
      });
      continue;
    }
    const mismatches: string[] = [];
    if (cached.name !== live.name) mismatches.push("name");
    if (cached.type !== live.type) mismatches.push("type");
    if (cached.parentId !== live.parentId) mismatches.push("parentId");
    if (cached.position !== live.position) mismatches.push("position");
    if (mismatches.length > 0) {
      events.push({
        guildId: input.guildId,
        severity: "warning",
        kind: "channel_field_mismatch",
        summary: `Channel "${live.name}" cache differs from Discord on: ${mismatches.join(", ")}.`,
        details: { channelId: id, fields: mismatches },
        detectedAt: now,
      });
    }
  }

  for (const [id, cached] of cacheChannels) {
    if (!liveChannels.has(id)) {
      events.push({
        guildId: input.guildId,
        severity: "warning",
        kind: "channel_phantom_in_cache",
        summary: `Cached channel "${cached.name}" no longer exists in Discord.`,
        details: { channelId: id, name: cached.name, type: cached.type },
        detectedAt: now,
      });
    }
  }

  const cacheRoles = new Map(input.cache.roles.map((r) => [r.id, r]));
  const liveRoles = new Map(input.live.roles.map((r) => [r.id, r]));

  for (const [id, live] of liveRoles) {
    const cached = cacheRoles.get(id);
    if (!cached) {
      events.push({
        guildId: input.guildId,
        severity: "warning",
        kind: "role_missing_from_cache",
        summary: `Role "${live.name}" exists in Discord but is missing from cache.`,
        details: { roleId: id, name: live.name },
        detectedAt: now,
      });
      continue;
    }
    if (cached.position !== live.position || cached.name !== live.name) {
      events.push({
        guildId: input.guildId,
        severity: "info",
        kind: "role_field_mismatch",
        summary: `Role "${live.name}" cache differs from Discord.`,
        details: {
          roleId: id,
          cached: { name: cached.name, position: cached.position },
          live: { name: live.name, position: live.position },
        },
        detectedAt: now,
      });
    }
  }

  for (const [id, cached] of cacheRoles) {
    if (!liveRoles.has(id)) {
      events.push({
        guildId: input.guildId,
        severity: "warning",
        kind: "role_phantom_in_cache",
        summary: `Cached role "${cached.name}" no longer exists in Discord.`,
        details: { roleId: id, name: cached.name },
        detectedAt: now,
      });
    }
  }

  return events;
}

/**
 * Project a live Discord Guild into the shape detectDrift expects. Keeps the
 * detector independent of discord.js internals.
 */
export function projectGuildForDrift(guild: Guild): DriftCheckInput["live"] {
  return {
    channels: guild.channels.cache
      .filter((c) => !c.isThread())
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        position: c.position,
      })),
    roles: guild.roles.cache.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
    })),
  };
}

export interface DriftDetectorOptions {
  intervalMs?: number;
  onEvents?: (events: DriftEvent[]) => void | Promise<void>;
}

export function startDriftDetector(
  client: Client,
  getCachedState: (guildId: string) => DriftCheckInput["cache"] | null,
  options: DriftDetectorOptions = {}
): () => void {
  const intervalMs = options.intervalMs ?? 60_000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const guild of client.guilds.cache.values()) {
        const cache = getCachedState(guild.id);
        if (!cache) continue;

        const live = projectGuildForDrift(guild);
        const events = detectDrift({ guildId: guild.id, cache, live });
        if (events.length === 0) continue;

        for (const event of events) emitDriftEvent(event);
        if (options.onEvents) {
          await options.onEvents(events);
        }
      }
    } catch {
      // detector errors must not crash the server
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => clearInterval(interval);
}
