import { describe, it, expect, beforeEach } from "vitest";
import { guildCache, initGuildCache } from "./cache";
import { formatGuildForLLM } from "./formatter";

describe("formatMemberRoles", () => {
  beforeEach(() => {
    guildCache.clear();
  });

  it("includes Discord user IDs alongside usernames", () => {
    const cache = initGuildCache("g1");
    cache.roles.set("role-1", {
      id: "role-1",
      name: "Admin",
      position: 5,
      permissions: [],
      color: 0,
      hoist: true,
      mentionable: false,
    });
    cache.members.set("user_123", {
      id: "user_123",
      username: "alice",
      roleIds: ["role-1"],
    });
    cache.members.set("user_456", {
      id: "user_456",
      username: "bob",
      roleIds: ["role-1"],
    });

    const output = formatGuildForLLM("g1");

    expect(output).toContain("alice (user_123)");
    expect(output).toContain("bob (user_456)");
  });

  it("shows count when more than 5 members share a role", () => {
    const cache = initGuildCache("g1");
    cache.roles.set("role-1", {
      id: "role-1",
      name: "Member",
      position: 1,
      permissions: [],
      color: 0,
      hoist: false,
      mentionable: false,
    });

    for (let i = 0; i < 10; i++) {
      cache.members.set(`user_${i}`, {
        id: `user_${i}`,
        username: `user${i}`,
        roleIds: ["role-1"],
      });
    }

    const output = formatGuildForLLM("g1");

    expect(output).toContain("user0 (user_0)");
    expect(output).toContain("+5 more");
  });

  it("shows @everyone with (all members)", () => {
    const cache = initGuildCache("g1");
    cache.roles.set("g1", {
      id: "g1",
      name: "@everyone",
      position: 0,
      permissions: [],
      color: 0,
      hoist: false,
      mentionable: false,
    });
    cache.members.set("user_1", {
      id: "user_1",
      username: "alice",
      roleIds: ["g1"],
    });

    const output = formatGuildForLLM("g1");

    expect(output).toContain("@everyone (1): (all members)");
  });
});

describe("formatGuildForLLM — IDs in output", () => {
  beforeEach(() => {
    guildCache.clear();
  });

  it("includes category IDs alongside names", () => {
    const cache = initGuildCache("g1");
    cache.channels.set("cat-1", {
      id: "cat-1",
      name: "Text Channels",
      type: 4,
      parentId: null,
      position: 0,
      lockPermissions: false,
    });

    const output = formatGuildForLLM("g1");

    expect(output).toContain("Text Channels (id:cat-1)");
  });

  it("includes channel IDs alongside names", () => {
    const cache = initGuildCache("g1");
    cache.channels.set("cat-1", {
      id: "cat-1",
      name: "Text Channels",
      type: 4,
      parentId: null,
      position: 0,
      lockPermissions: false,
    });
    cache.channels.set("ch-1", {
      id: "ch-1",
      name: "general",
      type: 0,
      parentId: "cat-1",
      position: 0,
      lockPermissions: true,
    });

    const output = formatGuildForLLM("g1");

    expect(output).toContain("#general — text (id:ch-1)");
  });

  it("includes role IDs alongside names", () => {
    const cache = initGuildCache("g1");
    cache.roles.set("role-1", {
      id: "role-1",
      name: "Admin",
      position: 5,
      permissions: [],
      color: 0,
      hoist: true,
      mentionable: false,
    });

    const output = formatGuildForLLM("g1");

    expect(output).toContain("Admin (id:role-1)");
  });
});
