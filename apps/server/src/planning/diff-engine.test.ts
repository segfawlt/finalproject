import { describe, it, expect } from "vitest";
import { diffEngine } from "../planning/diff-engine";
import type { DesiredState, ServerState, ChannelBase, PermissionOverwrite } from "@repo/shared";

function makeServerState(overrides: Partial<ServerState> = {}): ServerState {
  return {
    guildId: "g1",
    guildName: "Test",
    memberCount: 0,
    channels: [],
    roles: [],
    overwrites: [],
    memberRoles: [],
    ...overrides,
  };
}

function makeDesiredState(overrides: Partial<DesiredState> = {}): DesiredState {
  return {
    guildId: "g1",
    guildName: "Test",
    active: {
      channels: {},
      roles: {},
      overwrites: {},
      memberRoles: {},
    },
    tombstones: [],
    symbolCounter: 0,
    version: 0,
    ...overrides,
  };
}

describe("diffEngine — member roles", () => {
  it("emits add_role_to_member for roles added in desired state", () => {
    const real = makeServerState({
      memberRoles: [{ memberId: "user-1", roleIds: ["role-1"] }],
    });
    const desired = makeDesiredState({
      active: {
        channels: {},
        roles: {},
        overwrites: {},
        memberRoles: {
          "user-1": { memberId: "user-1", roleIds: ["role-1", "role-2"] },
        },
      },
    });

    const result = diffEngine(real, desired);
    const memberSteps = result.steps.filter((s) => s.toolName === "add_role_to_member");

    expect(memberSteps).toHaveLength(1);
    expect(memberSteps[0].params).toEqual({
      member_id: "user-1",
      role_id: "role-2",
    });
  });

  it("emits remove_role_from_member for roles removed in desired state", () => {
    const real = makeServerState({
      memberRoles: [{ memberId: "user-1", roleIds: ["role-1", "role-2"] }],
    });
    const desired = makeDesiredState({
      active: {
        channels: {},
        roles: {},
        overwrites: {},
        memberRoles: {
          "user-1": { memberId: "user-1", roleIds: ["role-1"] },
        },
      },
    });

    const result = diffEngine(real, desired);
    const memberSteps = result.steps.filter((s) => s.toolName === "remove_role_from_member");

    expect(memberSteps).toHaveLength(1);
    expect(memberSteps[0].params).toEqual({
      member_id: "user-1",
      role_id: "role-2",
    });
  });

  it("emits no member steps when desired matches real", () => {
    const real = makeServerState({
      memberRoles: [{ memberId: "user-1", roleIds: ["role-1"] }],
    });
    const desired = makeDesiredState({
      active: {
        channels: {},
        roles: {},
        overwrites: {},
        memberRoles: {
          "user-1": { memberId: "user-1", roleIds: ["role-1"] },
        },
      },
    });

    const result = diffEngine(real, desired);
    const memberSteps = result.steps.filter(
      (s) => s.toolName === "add_role_to_member" || s.toolName === "remove_role_from_member"
    );

    expect(memberSteps).toHaveLength(0);
  });

  it("handles multiple members with mixed changes", () => {
    const real = makeServerState({
      memberRoles: [
        { memberId: "user-1", roleIds: ["role-1"] },
        { memberId: "user-2", roleIds: ["role-1", "role-2"] },
      ],
    });
    const desired = makeDesiredState({
      active: {
        channels: {},
        roles: {},
        overwrites: {},
        memberRoles: {
          "user-1": { memberId: "user-1", roleIds: ["role-1", "role-2"] },
          "user-2": { memberId: "user-2", roleIds: ["role-1"] },
        },
      },
    });

    const result = diffEngine(real, desired);
    const addSteps = result.steps.filter((s) => s.toolName === "add_role_to_member");
    const removeSteps = result.steps.filter((s) => s.toolName === "remove_role_from_member");

    expect(addSteps).toHaveLength(1);
    expect(addSteps[0].params.role_id).toBe("role-2");
    expect(removeSteps).toHaveLength(1);
    expect(removeSteps[0].params.role_id).toBe("role-2");
  });

  it("places member steps after role creation in topological order", () => {
    const real = makeServerState();
    const desired = makeDesiredState({
      active: {
        channels: {},
        roles: {
          "$role_0": { id: "$role_0", name: "Admin", position: 1, permissions: [], color: 0, hoist: false, mentionable: false },
        },
        overwrites: {},
        memberRoles: {
          "user-1": { memberId: "user-1", roleIds: ["$role_0"] },
        },
      },
    });

    const result = diffEngine(real, desired);
    const createRoleIndex = result.steps.findIndex((s) => s.toolName === "create_role");
    const addMemberIndex = result.steps.findIndex((s) => s.toolName === "add_role_to_member");

    expect(createRoleIndex).toBeGreaterThanOrEqual(0);
    expect(addMemberIndex).toBeGreaterThanOrEqual(0);
    expect(addMemberIndex).toBeGreaterThan(createRoleIndex);
  });
});

describe("diffEngine — lockPermissions", () => {
  function makeChannel(overrides: Partial<ChannelBase> = {}): ChannelBase {
    return {
      id: "ch-1",
      name: "general",
      type: 0,
      parentId: "cat-1",
      position: 0,
      ...overrides,
    };
  }

  function makeOverwrite(channelId: string, roleId: string): PermissionOverwrite {
    return { channelId, roleId, allow: ["VIEW_CHANNEL"], deny: [] };
  }

  it("emits lock_permissions in create_channel params", () => {
    const real = makeServerState();
    const desired = makeDesiredState({
      active: {
        channels: {
          "$ch_0": makeChannel({ id: "$ch_0", lockPermissions: true }),
        },
        roles: {},
        overwrites: {},
        memberRoles: {},
      },
    });

    const result = diffEngine(real, desired);
    const createStep = result.steps.find((s) => s.toolName === "create_channel");

    expect(createStep).toBeDefined();
    expect(createStep!.params.lock_permissions).toBe(true);
  });

  it("emits lock_permissions in edit_channel when it changes", () => {
    const real = makeServerState({
      channels: [makeChannel({ id: "ch-1", lockPermissions: true })],
    });
    const desired = makeDesiredState({
      active: {
        channels: {
          "ch-1": makeChannel({ id: "ch-1", lockPermissions: false }),
        },
        roles: {},
        overwrites: {},
        memberRoles: {},
      },
    });

    const result = diffEngine(real, desired);
    const editStep = result.steps.find((s) => s.toolName === "edit_channel");

    expect(editStep).toBeDefined();
    expect(editStep!.params.lock_permissions).toBe(false);
  });

  it("skips set_overwrite for synced channels (lockPermissions: true)", () => {
    const real = makeServerState({
      channels: [makeChannel({ id: "ch-1", parentId: "cat-1" })],
      overwrites: [makeOverwrite("ch-1", "role-1")],
    });
    const desired = makeDesiredState({
      active: {
        channels: {
          "ch-1": makeChannel({ id: "ch-1", parentId: "cat-1", lockPermissions: true }),
        },
        roles: {},
        overwrites: {
          "ch-1:role-1": { ...makeOverwrite("ch-1", "role-1"), allow: ["VIEW_CHANNEL", "SEND_MESSAGES"] },
        },
        memberRoles: {},
      },
    });

    const result = diffEngine(real, desired);
    const overwriteSteps = result.steps.filter(
      (s) => s.toolName === "set_overwrite" || s.toolName === "remove_overwrite"
    );

    expect(overwriteSteps).toHaveLength(0);
  });

  it("still emits set_overwrite for unsynced channels (lockPermissions: false)", () => {
    const real = makeServerState({
      channels: [makeChannel({ id: "ch-1", parentId: "cat-1" })],
      overwrites: [makeOverwrite("ch-1", "role-1")],
    });
    const desired = makeDesiredState({
      active: {
        channels: {
          "ch-1": makeChannel({ id: "ch-1", parentId: "cat-1", lockPermissions: false }),
        },
        roles: {},
        overwrites: {
          "ch-1:role-1": { ...makeOverwrite("ch-1", "role-1"), allow: ["VIEW_CHANNEL", "SEND_MESSAGES"] },
        },
        memberRoles: {},
      },
    });

    const result = diffEngine(real, desired);
    const overwriteSteps = result.steps.filter(
      (s) => s.toolName === "set_overwrite" || s.toolName === "remove_overwrite"
    );

    expect(overwriteSteps).toHaveLength(1);
    expect(overwriteSteps[0].toolName).toBe("set_overwrite");
  });

  it("still emits remove_overwrite for synced channels (deletion is not affected by lockPermissions)", () => {
    const real = makeServerState({
      channels: [makeChannel({ id: "ch-1", parentId: "cat-1" })],
      overwrites: [makeOverwrite("ch-1", "role-1")],
    });
    const desired = makeDesiredState({
      active: {
        channels: {
          "ch-1": makeChannel({ id: "ch-1", parentId: "cat-1", lockPermissions: true }),
        },
        roles: {},
        overwrites: {},
        memberRoles: {},
      },
    });

    const result = diffEngine(real, desired);
    const removeSteps = result.steps.filter((s) => s.toolName === "remove_overwrite");

    expect(removeSteps).toHaveLength(1);
  });
});
