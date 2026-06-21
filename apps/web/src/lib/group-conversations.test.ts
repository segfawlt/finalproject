import { describe, it, expect } from "vitest";
import { groupConversationsByDate, type ConversationRow } from "./group-conversations";

function conv(date: Date, id: string = String(date.getTime())): ConversationRow {
  return {
    id,
    guildId: "g",
    userId: "u",
    status: "completed",
    userPrompt: id,
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  };
}

describe("groupConversationsByDate", () => {
  // Anchor at a fixed LOCAL time so tests are timezone-agnostic.
  const now = new Date(2026, 5, 21, 15, 0, 0); // Jun 21 2026, 3:00 PM local
  const todayMorning = new Date(2026, 5, 21, 8, 0, 0);
  const yesterdayLateNight = new Date(2026, 5, 20, 23, 30, 0);
  const threeDaysAgo = new Date(2026, 5, 18, 10, 0, 0);
  const monthAgo = new Date(2026, 4, 21, 12, 0, 0);

  it("returns empty groups for empty input", () => {
    const out = groupConversationsByDate([], now);
    expect(out).toEqual({ today: [], yesterday: [], earlier: [] });
  });

  it("buckets a conversation from earlier today into today", () => {
    const out = groupConversationsByDate([conv(todayMorning, "a")], now);
    expect(out.today.map((c) => c.id)).toEqual(["a"]);
    expect(out.yesterday).toEqual([]);
    expect(out.earlier).toEqual([]);
  });

  it("buckets a conversation from late yesterday into yesterday", () => {
    const out = groupConversationsByDate([conv(yesterdayLateNight, "a")], now);
    expect(out.yesterday.map((c) => c.id)).toEqual(["a"]);
    expect(out.today).toEqual([]);
    expect(out.earlier).toEqual([]);
  });

  it("buckets a conversation from 3 days ago into earlier", () => {
    const out = groupConversationsByDate([conv(threeDaysAgo, "a")], now);
    expect(out.earlier.map((c) => c.id)).toEqual(["a"]);
  });

  it("buckets a conversation from a month ago into earlier", () => {
    const out = groupConversationsByDate([conv(monthAgo, "a")], now);
    expect(out.earlier.map((c) => c.id)).toEqual(["a"]);
  });

  it("preserves input order within each bucket", () => {
    const a = conv(todayMorning, "a");
    const b = new Date(2026, 5, 21, 12, 0, 0);
    const c = conv(yesterdayLateNight, "c");
    const d = conv(threeDaysAgo, "d");
    const out = groupConversationsByDate([a, conv(b, "b"), c, d], now);
    expect(out.today).toEqual([a, conv(b, "b")]);
    expect(out.yesterday).toEqual([c]);
    expect(out.earlier).toEqual([d]);
  });

  it("invalid dates fall into earlier", () => {
    const bad: ConversationRow = {
      id: "bad",
      guildId: "g",
      userId: "u",
      status: "completed",
      userPrompt: "bad",
      createdAt: "not-a-date",
      updatedAt: "not-a-date",
    };
    const out = groupConversationsByDate([bad], now);
    expect(out.earlier).toEqual([bad]);
  });
});
