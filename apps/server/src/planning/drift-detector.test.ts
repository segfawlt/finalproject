import { describe, it, expect, beforeEach } from "vitest";
import {
  detectDrift,
  subscribeToGuildDrift,
  emitDriftEvent,
  type DriftCheckInput,
  type DriftEvent,
} from "./drift-detector";

function emptyInput(): DriftCheckInput {
  return {
    guildId: "g1",
    cache: { channels: [], roles: [] },
    live: { channels: [], roles: [] },
  };
}

describe("detectDrift", () => {
  it("returns no events when cache and live are identical", () => {
    const input: DriftCheckInput = {
      guildId: "g1",
      cache: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 0 },
        ],
        roles: [{ id: "r1", name: "Member", position: 1 }],
      },
      live: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 0 },
        ],
        roles: [{ id: "r1", name: "Member", position: 1 }],
      },
    };
    expect(detectDrift(input)).toEqual([]);
  });

  it("detects channel present in live but missing from cache", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      live: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 0 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("channel_missing_from_cache");
    expect(events[0].severity).toBe("warning");
    expect(events[0].details).toMatchObject({ channelId: "c1", name: "general", type: 0 });
  });

  it("detects channel present in cache but missing from live (phantom)", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      cache: {
        channels: [
          { id: "c1", name: "old", type: 0, parentId: null, position: 0 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("channel_phantom_in_cache");
    expect(events[0].details).toMatchObject({ channelId: "c1", name: "old" });
  });

  it("detects channel field mismatch (name, type, parentId, position)", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      cache: {
        channels: [
          { id: "c1", name: "old-name", type: 0, parentId: "cat1", position: 1 },
        ],
        roles: [],
      },
      live: {
        channels: [
          { id: "c1", name: "new-name", type: 2, parentId: "cat2", position: 5 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("channel_field_mismatch");
    const fields = events[0].details.fields as string[];
    expect(fields.sort()).toEqual(["name", "parentId", "position", "type"]);
  });

  it("detects single field mismatch without flagging the rest", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      cache: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 0 },
        ],
        roles: [],
      },
      live: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 7 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    expect(events).toHaveLength(1);
    expect(events[0].details.fields).toEqual(["position"]);
  });

  it("detects role missing from cache and phantom in cache symmetrically", () => {
    const missing: DriftCheckInput = {
      ...emptyInput(),
      live: { channels: [], roles: [{ id: "r1", name: "Mod", position: 5 }] },
    };
    expect(detectDrift(missing)[0].kind).toBe("role_missing_from_cache");

    const phantom: DriftCheckInput = {
      ...emptyInput(),
      cache: { channels: [], roles: [{ id: "r1", name: "Mod", position: 5 }] },
    };
    expect(detectDrift(phantom)[0].kind).toBe("role_phantom_in_cache");
  });

  it("detects role field mismatch as info severity", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      cache: { channels: [], roles: [{ id: "r1", name: "Old", position: 1 }] },
      live: { channels: [], roles: [{ id: "r1", name: "New", position: 2 }] },
    };
    const events = detectDrift(input);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("role_field_mismatch");
    expect(events[0].severity).toBe("info");
  });

  it("returns multiple events when multiple discrepancies exist", () => {
    const input: DriftCheckInput = {
      guildId: "g1",
      cache: {
        channels: [
          { id: "c1", name: "phantom", type: 0, parentId: null, position: 0 },
        ],
        roles: [{ id: "r1", name: "stale", position: 1 }],
      },
      live: {
        channels: [
          { id: "c2", name: "new", type: 0, parentId: null, position: 0 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    const kinds = events.map((e) => e.kind).sort();
    expect(kinds).toEqual([
      "channel_missing_from_cache",
      "channel_phantom_in_cache",
      "role_phantom_in_cache",
    ]);
  });

  it("tags every event with the same guildId and a detectedAt timestamp", () => {
    const input: DriftCheckInput = {
      ...emptyInput(),
      live: {
        channels: [
          { id: "c1", name: "general", type: 0, parentId: null, position: 0 },
        ],
        roles: [],
      },
    };
    const events = detectDrift(input);
    for (const ev of events) {
      expect(ev.guildId).toBe("g1");
      expect(typeof ev.detectedAt).toBe("string");
      expect(Number.isNaN(Date.parse(ev.detectedAt))).toBe(false);
    }
  });
});

describe("drift event bus", () => {
  const guildId = "g-test";
  let received: DriftEvent[];

  beforeEach(() => {
    received = [];
  });

  it("delivers events to subscribers of the same guild", () => {
    const unsubscribe = subscribeToGuildDrift(guildId, (e) => received.push(e));
    const event: DriftEvent = {
      guildId,
      severity: "warning",
      kind: "test",
      summary: "hello",
      details: {},
      detectedAt: new Date().toISOString(),
    };
    emitDriftEvent(event);
    expect(received).toEqual([event]);
    unsubscribe();
  });

  it("does not deliver events to subscribers of other guilds", () => {
    subscribeToGuildDrift("other", (e) => received.push(e));
    emitDriftEvent({
      guildId,
      severity: "warning",
      kind: "test",
      summary: "x",
      details: {},
      detectedAt: new Date().toISOString(),
    });
    expect(received).toEqual([]);
  });

  it("unsubscribe stops further deliveries", () => {
    const unsubscribe = subscribeToGuildDrift(guildId, (e) => received.push(e));
    emitDriftEvent({
      guildId,
      severity: "warning",
      kind: "a",
      summary: "x",
      details: {},
      detectedAt: new Date().toISOString(),
    });
    unsubscribe();
    emitDriftEvent({
      guildId,
      severity: "warning",
      kind: "b",
      summary: "x",
      details: {},
      detectedAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(1);
    expect(received[0].kind).toBe("a");
  });

  it("removes a throwing subscriber and continues delivering to others", () => {
    subscribeToGuildDrift(guildId, () => {
      throw new Error("boom");
    });
    subscribeToGuildDrift(guildId, (e) => received.push(e));
    emitDriftEvent({
      guildId,
      severity: "warning",
      kind: "x",
      summary: "x",
      details: {},
      detectedAt: new Date().toISOString(),
    });
    expect(received).toHaveLength(1);
  });
});
