import { describe, it, expect, vi } from "vitest";
import { validatePlan } from "./validation";
import type { PlanStep, SymbolTable, DesiredState } from "@repo/shared";

// Mock bot permissions and cache
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

describe("validatePlan bot hierarchy", () => {
  const emptyDesiredState: DesiredState = {
    guildId: "g1",
    guildName: "Test",
    active: { channels: {}, roles: {}, overwrites: {} },
    tombstones: [],
    symbolCounter: 0,
    version: 1,
  };

  const emptySymbolTable: SymbolTable = {};

  it("blocks when target role is above bot's position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "edit_role",
        params: { id: "role_high", name: "New Name" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    expect(result.passed).toBe(false);
    const blocker = result.issues.find(
      (i) => i.group === "A. Permission" && i.message.includes("below a role")
    );
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("block");
  });

  it("passes when target role is below bot's position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "edit_role",
        params: { id: "role_low", name: "New Name" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) => i.group === "A. Permission" && i.message.includes("below a role")
    );
    expect(blocker).toBeUndefined();
  });

  it("ignores symbol-based roles (new roles) in hierarchy check", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "edit_role",
        params: { id: "$role_0", name: "New Role" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) => i.group === "A. Permission" && i.message.includes("below a role")
    );
    expect(blocker).toBeUndefined();
  });
});

describe("validatePlan member tools", () => {
  const emptyDesiredState: DesiredState = {
    guildId: "g1",
    guildName: "Test",
    active: { channels: {}, roles: {}, overwrites: {} },
    tombstones: [],
    symbolCounter: 0,
    version: 1,
  };

  const emptySymbolTable: SymbolTable = {};

  it("blocks add_role_to_member when role is above bot position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "add_role_to_member",
        params: { member_id: "user-1", role_id: "role_high" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) =>
        i.group === "A. Permission" &&
        i.message.includes("cannot assign") &&
        i.message.includes("above")
    );
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("block");
  });

  it("blocks duplicate add_role_to_member for same member+role", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "add_role_to_member",
        params: { member_id: "user-1", role_id: "role_low" },
        status: "pending",
      },
      {
        index: 1,
        toolName: "add_role_to_member",
        params: { member_id: "user-1", role_id: "role_low" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const dupIssue = result.issues.find(
      (i) => i.group === "C. Resource" && i.message.includes("duplicate")
    );
    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe("block");
  });

  it("passes add_role_to_member when role is below bot position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "add_role_to_member",
        params: { member_id: "user-1", role_id: "role_low" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) =>
        i.group === "A. Permission" &&
        i.message.includes("cannot assign") &&
        i.message.includes("above")
    );
    expect(blocker).toBeUndefined();
  });
});

describe("validateOverwriteConsolidation", () => {
  const emptySymbolTable: SymbolTable = {};

  it("warns when two un-synced channels in same category have identical overwrites", async () => {
    const desiredState: DesiredState = {
      guildId: "g1",
      guildName: "Test",
      active: {
        channels: {
          "ch-1": {
            id: "ch-1",
            name: "general",
            type: 0,
            parentId: "cat-1",
            position: 0,
            lockPermissions: false,
          },
          "ch-2": {
            id: "ch-2",
            name: "announcements",
            type: 0,
            parentId: "cat-1",
            position: 1,
            lockPermissions: false,
          },
        },
        roles: {},
        overwrites: {
          "ch-1:role-1": {
            channelId: "ch-1",
            roleId: "role-1",
            allow: ["VIEW_CHANNEL"],
            deny: [],
          },
          "ch-2:role-1": {
            channelId: "ch-2",
            roleId: "role-1",
            allow: ["VIEW_CHANNEL"],
            deny: [],
          },
        },
        memberRoles: {},
      },
      tombstones: [],
      symbolCounter: 0,
      version: 1,
    };

    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_channel",
        params: {},
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState,
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

  it("does not warn when one channel is synced (lockPermissions: true)", async () => {
    const desiredState: DesiredState = {
      guildId: "g1",
      guildName: "Test",
      active: {
        channels: {
          "ch-1": {
            id: "ch-1",
            name: "general",
            type: 0,
            parentId: "cat-1",
            position: 0,
            lockPermissions: true,
          },
          "ch-2": {
            id: "ch-2",
            name: "announcements",
            type: 0,
            parentId: "cat-1",
            position: 1,
            lockPermissions: false,
          },
        },
        roles: {},
        overwrites: {
          "ch-1:role-1": {
            channelId: "ch-1",
            roleId: "role-1",
            allow: ["VIEW_CHANNEL"],
            deny: [],
          },
          "ch-2:role-1": {
            channelId: "ch-2",
            roleId: "role-1",
            allow: ["VIEW_CHANNEL"],
            deny: [],
          },
        },
        memberRoles: {},
      },
      tombstones: [],
      symbolCounter: 0,
      version: 1,
    };

    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_channel",
        params: {},
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable: emptySymbolTable,
      desiredState,
      guildId: "g1",
      status: "draft",
    });

    const warning = result.issues.find(
      (i) => i.group === "D. Safety" && i.message.includes("identical permissions")
    );
    expect(warning).toBeUndefined();
  });
});
