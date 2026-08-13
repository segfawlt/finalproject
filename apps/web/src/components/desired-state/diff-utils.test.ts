import { describe, it, expect } from "vitest";
import {
  diffChannels,
  diffRoles,
  diffMemberRoles,
  computeFullDiff,
  summarizeFullDiff,
} from "./diff-utils";
import type { ChannelBase, Role, MemberRoleAssignment, ServerState } from "./types";

function ch(overrides: Partial<ChannelBase> & { id: string; name: string }): ChannelBase {
  return {
    type: 0,
    parentId: null,
    position: 0,
    ...overrides,
  };
}

function role(overrides: Partial<Role> & { id: string; name: string }): Role {
  return {
    position: 0,
    permissions: [],
    color: 0,
    hoist: false,
    mentionable: false,
    ...overrides,
  };
}

function member(memberId: string, roleIds: string[]): MemberRoleAssignment {
  return { memberId, roleIds };
}

describe("diffChannels", () => {
  it("treats symbol-keyed desired channels as new", () => {
    const desired = { "$sym-1": ch({ id: "$sym-1", name: "new-channel" }) };
    const result = diffChannels(desired, [], []);
    expect(result.byKey.get("$sym-1")).toBe("new");
    expect(result.removed).toHaveLength(0);
  });

  it("marks real-id desired channels that exist in real state as unchanged", () => {
    const real: ChannelBase[] = [ch({ id: "real-1", name: "general", position: 5 })];
    const desired = { "real-1": ch({ id: "real-1", name: "general", position: 5 }) };
    const result = diffChannels(desired, real, []);
    expect(result.byKey.get("real-1")).toBe("unchanged");
  });

  it("marks real-id desired channels with field changes as modified", () => {
    const real: ChannelBase[] = [ch({ id: "real-1", name: "general" })];
    const desired = { "real-1": ch({ id: "real-1", name: "renamed" }) };
    const result = diffChannels(desired, real, []);
    expect(result.byKey.get("real-1")).toBe("modified");
  });

  it("treats desired channels whose real id is in tombstones as new (recreated)", () => {
    const real: ChannelBase[] = [ch({ id: "real-1", name: "general" })];
    const desired = { "real-1": ch({ id: "real-1", name: "general" }) };
    const result = diffChannels(desired, real, [
      { discordId: "real-1", resourceType: "channel", name: "general", deletedInVersion: 1 },
    ]);
    expect(result.byKey.get("real-1")).toBe("new");
  });

  it("lists real channels absent from desired as removed", () => {
    const real: ChannelBase[] = [
      ch({ id: "real-1", name: "general" }),
      ch({ id: "real-2", name: "off-topic" }),
    ];
    const desired = { "real-1": ch({ id: "real-1", name: "general" }) };
    const result = diffChannels(desired, real, []);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].id).toBe("real-2");
  });

  it("detects topic and lock-permission changes as modified", () => {
    const real: ChannelBase[] = [
      ch({ id: "real-1", name: "general", topic: "old topic", lockPermissions: true }),
    ];
    const desired = {
      "real-1": ch({ id: "real-1", name: "general", topic: "new topic", lockPermissions: false }),
    };
    const result = diffChannels(desired, real, []);
    expect(result.byKey.get("real-1")).toBe("modified");
  });
});

describe("diffRoles", () => {
  it("detects permission changes as modified", () => {
    const real: Role[] = [role({ id: "r1", name: "Mod", permissions: ["MANAGE_MESSAGES"] })];
    const desired = {
      r1: role({ id: "r1", name: "Mod", permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS"] }),
    };
    const result = diffRoles(desired, real, []);
    expect(result.byKey.get("r1")).toBe("modified");
  });

  it("marks unchanged roles as unchanged", () => {
    const real: Role[] = [role({ id: "r1", name: "Mod", permissions: ["MANAGE_MESSAGES"] })];
    const desired = { r1: role({ id: "r1", name: "Mod", permissions: ["MANAGE_MESSAGES"] }) };
    const result = diffRoles(desired, real, []);
    expect(result.byKey.get("r1")).toBe("unchanged");
  });

  it("tombstoned real role is treated as new", () => {
    const real: Role[] = [role({ id: "r1", name: "Mod" })];
    const desired = { r1: role({ id: "r1", name: "Mod" }) };
    const result = diffRoles(desired, real, [
      { discordId: "r1", resourceType: "role", name: "Mod", deletedInVersion: 2 },
    ]);
    expect(result.byKey.get("r1")).toBe("new");
  });
});

describe("diffMemberRoles", () => {
  it("detects changed role list as modified", () => {
    const real: MemberRoleAssignment[] = [member("u1", ["r1"])];
    const desired = { u1: member("u1", ["r1", "r2"]) };
    const result = diffMemberRoles(desired, real);
    expect(result.byKey.get("u1")).toBe("modified");
  });

  it("marks identical assignments as unchanged", () => {
    const real: MemberRoleAssignment[] = [member("u1", ["r1", "r2"])];
    const desired = { u1: member("u1", ["r1", "r2"]) };
    const result = diffMemberRoles(desired, real);
    expect(result.byKey.get("u1")).toBe("unchanged");
  });

  it("marks symbol-keyed desired assignments as new", () => {
    const real: MemberRoleAssignment[] = [member("u1", ["r1"])];
    const desired = { "$sym-1": member("u1", ["r1"]) };
    const result = diffMemberRoles(desired, real);
    expect(result.byKey.get("$sym-1")).toBe("new");
  });
});

describe("computeFullDiff", () => {
  it("returns null when no current state provided", () => {
    const result = computeFullDiff({ channels: {}, roles: {}, overwrites: {} }, null, []);
    expect(result).toBeNull();
  });

  it("returns full diff with all four maps when current state is provided", () => {
    const current: ServerState = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 1,
      channels: [ch({ id: "c1", name: "general" })],
      roles: [role({ id: "r1", name: "Mod" })],
      overwrites: [],
      memberRoles: [member("u1", ["r1"])],
    };
    const desired = {
      channels: { "$sym-1": ch({ id: "$sym-1", name: "new" }) },
      roles: { r1: role({ id: "r1", name: "Mod" }) },
      overwrites: {},
    };
    const result = computeFullDiff(desired, current, []);
    expect(result).not.toBeNull();
    expect(result!.channels.byKey.get("$sym-1")).toBe("new");
    expect(result!.channels.removed[0].id).toBe("c1");
    expect(result!.roles.byKey.get("r1")).toBe("unchanged");
  });

  it("summarizes additions, modifications, and removals across the full diff", () => {
    const current: ServerState = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 1,
      channels: [ch({ id: "c1", name: "renamed" }), ch({ id: "c2", name: "deleted" })],
      roles: [role({ id: "r1", name: "Changed" })],
      overwrites: [],
      memberRoles: [member("u1", ["r1"])],
    };
    const desired = {
      channels: {
        c1: ch({ id: "c1", name: "renamed-again" }),
        $new: ch({ id: "$new", name: "new" }),
      },
      roles: { r1: role({ id: "r1", name: "Changed" }) },
      overwrites: {},
      memberRoles: { u1: member("u1", ["r1", "r2"]) },
    };

    const diff = computeFullDiff(desired, current, []);
    expect(summarizeFullDiff(diff)).toEqual({ added: 1, modified: 2, removed: 1 });
  });
});
