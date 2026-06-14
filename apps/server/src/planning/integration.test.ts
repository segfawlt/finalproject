import { describe, it, expect, vi } from "vitest";
import { diffEngine } from "./diff-engine";
import { validatePlan } from "./validation";
import type { DesiredState, ServerState, ChannelBase, PermissionOverwrite } from "@repo/shared";

// Mock bot permissions and cache (same pattern as validation.test.ts)
vi.mock("../bot/permissions", () => ({
  botHasAdministrator: vi.fn(() => true),
  getBotHighestRolePosition: vi.fn(() => 5),
}));

vi.mock("../bot/cache", () => ({
  guildCache: {
    get: vi.fn(() => ({
      roles: new Map([
        ["role_low", { position: 1 }],
        ["role_high", { position: 10 }],
      ]),
    })),
  },
}));

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
    active: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
    tombstones: [],
    symbolCounter: 0,
    version: 0,
    ...overrides,
  };
}

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

function makeOverwrite(
  channelId: string,
  roleId: string,
  overrides: Partial<PermissionOverwrite> = {}
): PermissionOverwrite {
  return {
    channelId,
    roleId,
    allow: ["VIEW_CHANNEL"],
    deny: [],
    ...overrides,
  };
}

describe("integration — ServerState → diff → validate pipeline", () => {
  it("synced channel: emits set_overwrite for category, skips channel-level overwrite", async () => {
    const real = makeServerState({
      channels: [
        makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
        makeChannel({ id: "ch-1", name: "staff-chat", parentId: "cat-1", lockPermissions: true }),
      ],
      roles: [
        {
          id: "role-1",
          name: "Mod",
          position: 3,
          permissions: [],
          color: 0,
          hoist: false,
          mentionable: false,
        },
      ],
      overwrites: [],
    });

    const desired = makeDesiredState({
      active: {
        channels: {
          "cat-1": makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
          "ch-1": makeChannel({
            id: "ch-1",
            name: "staff-chat",
            parentId: "cat-1",
            lockPermissions: true,
          }),
        },
        roles: {
          "role-1": {
            id: "role-1",
            name: "Mod",
            position: 3,
            permissions: [],
            color: 0,
            hoist: false,
            mentionable: false,
          },
        },
        overwrites: {
          "cat-1:role-1": makeOverwrite("cat-1", "role-1"),
          "ch-1:role-1": makeOverwrite("ch-1", "role-1", {
            allow: ["VIEW_CHANNEL", "SEND_MESSAGES"],
          }),
        },
        memberRoles: {},
      },
    });

    const { steps, symbolTable } = diffEngine(real, desired);

    // Category gets an overwrite step (doesn't exist in real)
    const catOverwrite = steps.find(
      (s) => s.toolName === "set_overwrite" && s.params.channel_id === "cat-1"
    );
    expect(catOverwrite).toBeDefined();

    // Synced channel does NOT get its own set_overwrite
    const chOverwrite = steps.find(
      (s) => s.toolName === "set_overwrite" && s.params.channel_id === "ch-1"
    );
    expect(chOverwrite).toBeUndefined();

    // Validate the plan passes
    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: desired,
      guildId: "g1",
      status: "draft",
    });
    expect(result.passed).toBe(true);
  });

  it("unsynced channel: emits set_overwrite at channel level", async () => {
    const real = makeServerState({
      channels: [
        makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
        makeChannel({ id: "ch-1", name: "staff-chat", parentId: "cat-1", lockPermissions: false }),
      ],
      roles: [
        {
          id: "role-1",
          name: "Mod",
          position: 3,
          permissions: [],
          color: 0,
          hoist: false,
          mentionable: false,
        },
      ],
      overwrites: [],
    });

    const desired = makeDesiredState({
      active: {
        channels: {
          "cat-1": makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
          "ch-1": makeChannel({
            id: "ch-1",
            name: "staff-chat",
            parentId: "cat-1",
            lockPermissions: false,
          }),
        },
        roles: {
          "role-1": {
            id: "role-1",
            name: "Mod",
            position: 3,
            permissions: [],
            color: 0,
            hoist: false,
            mentionable: false,
          },
        },
        overwrites: {
          "ch-1:role-1": makeOverwrite("ch-1", "role-1"),
        },
        memberRoles: {},
      },
    });

    const { steps, symbolTable } = diffEngine(real, desired);

    // Unsynced channel gets its own set_overwrite
    const chOverwrite = steps.find(
      (s) => s.toolName === "set_overwrite" && s.params.channel_id === "ch-1"
    );
    expect(chOverwrite).toBeDefined();

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: desired,
      guildId: "g1",
      status: "draft",
    });
    expect(result.passed).toBe(true);
  });

  it("toggling unsynced → synced emits edit_channel with lock_permissions", async () => {
    const real = makeServerState({
      channels: [
        makeChannel({ id: "ch-1", name: "staff-chat", parentId: "cat-1", lockPermissions: false }),
      ],
      roles: [],
      overwrites: [],
    });

    const desired = makeDesiredState({
      active: {
        channels: {
          "ch-1": makeChannel({
            id: "ch-1",
            name: "staff-chat",
            parentId: "cat-1",
            lockPermissions: true,
          }),
        },
        roles: {},
        overwrites: {},
        memberRoles: {},
      },
    });

    const { steps, symbolTable } = diffEngine(real, desired);

    const editStep = steps.find((s) => s.toolName === "edit_channel");
    expect(editStep).toBeDefined();
    expect(editStep!.params.lock_permissions).toBe(true);

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: desired,
      guildId: "g1",
      status: "draft",
    });
    expect(result.passed).toBe(true);
  });

  it("emits consolidation warning for identical unsynced channels in same category", async () => {
    const real = makeServerState({
      channels: [
        makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
        makeChannel({ id: "ch-1", name: "staff-chat", parentId: "cat-1", lockPermissions: false }),
        makeChannel({ id: "ch-2", name: "mod-chat", parentId: "cat-1", lockPermissions: false }),
      ],
      roles: [
        {
          id: "role-1",
          name: "Mod",
          position: 3,
          permissions: [],
          color: 0,
          hoist: false,
          mentionable: false,
        },
      ],
      overwrites: [],
    });

    const desired = makeDesiredState({
      active: {
        channels: {
          "cat-1": makeChannel({ id: "cat-1", name: "Staff", type: 4, parentId: null }),
          "ch-1": makeChannel({
            id: "ch-1",
            name: "staff-chat",
            parentId: "cat-1",
            lockPermissions: false,
          }),
          "ch-2": makeChannel({
            id: "ch-2",
            name: "mod-chat",
            parentId: "cat-1",
            lockPermissions: false,
          }),
        },
        roles: {
          "role-1": {
            id: "role-1",
            name: "Mod",
            position: 3,
            permissions: [],
            color: 0,
            hoist: false,
            mentionable: false,
          },
        },
        overwrites: {
          "ch-1:role-1": makeOverwrite("ch-1", "role-1"),
          "ch-2:role-1": makeOverwrite("ch-2", "role-1"),
        },
        memberRoles: {},
      },
      version: 1,
    });

    const { steps, symbolTable } = diffEngine(real, desired);

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: desired,
      guildId: "g1",
      status: "draft",
    });

    const warning = result.issues.find(
      (i) =>
        i.group === "D. Safety" &&
        i.message.includes("identical permissions") &&
        i.severity === "warning"
    );
    expect(warning).toBeDefined();
  });
});
