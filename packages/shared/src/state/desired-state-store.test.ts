import { describe, it, expect } from "vitest";
import { DesiredStateStore } from "./desired-state-store";

describe("DesiredStateStore.addChannel", () => {
  it("stores forum-specific properties", () => {
    const store = new DesiredStateStore();
    const symbol = store.addChannel({
      name: "bug-reports",
      type: 15,
      availableTags: [
        { name: "Critical", moderated: true },
        { name: "Low", emojiId: "emoji_123" },
      ],
      defaultReactionEmoji: { emojiId: "456", emojiName: "👍" },
      defaultSortOrder: 1,
      defaultForumLayout: 2,
      defaultThreadRateLimitPerUser: 120,
      flags: 16,
    });

    const state = store.getState();
    const channel = state.active.channels[symbol];

    expect(channel.availableTags).toEqual([
      { name: "Critical", moderated: true },
      { name: "Low", emojiId: "emoji_123" },
    ]);
    expect(channel.defaultReactionEmoji).toEqual({ emojiId: "456", emojiName: "👍" });
    expect(channel.defaultSortOrder).toBe(1);
    expect(channel.defaultForumLayout).toBe(2);
    expect(channel.defaultThreadRateLimitPerUser).toBe(120);
    expect(channel.flags).toBe(16);
  });

  it("stores media channel without forum fields", () => {
    const store = new DesiredStateStore();
    const symbol = store.addChannel({
      name: "media-gallery",
      type: 16,
    });

    const state = store.getState();
    const channel = state.active.channels[symbol];
    expect(channel.type).toBe(16);
    expect(channel.availableTags).toBeUndefined();
  });
});

describe("DesiredStateStore.editChannel", () => {
  it("updates forum properties on existing channel", () => {
    const store = new DesiredStateStore();
    const symbol = store.addChannel({ name: "forum", type: 15 });

    store.editChannel(symbol, {
      availableTags: [{ name: "Updated" }],
      defaultSortOrder: 0,
      flags: 0,
    });

    const state = store.getState();
    const channel = state.active.channels[symbol];
    expect(channel.availableTags).toEqual([{ name: "Updated" }]);
    expect(channel.defaultSortOrder).toBe(0);
    expect(channel.flags).toBe(0);
  });

  it("preserves existing forum properties when editing unrelated fields", () => {
    const store = new DesiredStateStore();
    const symbol = store.addChannel({
      name: "forum",
      type: 15,
      availableTags: [{ name: "Keep" }],
      flags: 16,
    });

    store.editChannel(symbol, { name: "renamed-forum" });

    const state = store.getState();
    const channel = state.active.channels[symbol];
    expect(channel.name).toBe("renamed-forum");
    expect(channel.availableTags).toEqual([{ name: "Keep" }]);
    expect(channel.flags).toBe(16);
  });
});

describe("DesiredStateStore.fork", () => {
  it("preserves forum properties from server state", () => {
    const serverState = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 5,
      channels: [
        {
          id: "ch1",
          name: "forum",
          type: 15,
          parentId: null,
          position: 0,
          availableTags: [{ name: "Tag1" }],
          defaultSortOrder: 1,
        },
      ],
      roles: [],
      overwrites: [],
      memberRoles: [],
    };

    const store = DesiredStateStore.fork(serverState);
    const state = store.getState();
    const channel = state.active.channels["ch1"];

    expect(channel.availableTags).toEqual([{ name: "Tag1" }]);
    expect(channel.defaultSortOrder).toBe(1);
  });
});
