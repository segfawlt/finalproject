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
        ["role_equal", { position: 5 }],
        ["role_high", { position: 10 }],
      ]),
    })),
  },
}));

vi.mock("@repo/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
  },
  rules: { guildId: "guild_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
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

  it("blocks when target role is at the bot's position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "edit_role",
        params: { id: "role_equal", name: "New Name" },
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
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("block");
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

  it("blocks add_role_to_member when role is at bot position", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "add_role_to_member",
        params: { member_id: "user-1", role_id: "role_equal" },
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

describe("validatePlan symbol type matching", () => {
  const emptyDesiredState: DesiredState = {
    guildId: "g1",
    guildName: "Test",
    active: { channels: {}, roles: {}, overwrites: {} },
    tombstones: [],
    symbolCounter: 0,
    version: 1,
  };

  it("blocks when a channel symbol is passed where a role is expected", async () => {
    const symbolTable: SymbolTable = {
      $ch_0: { symbol: "$ch_0", type: "channel", definingStepIndex: 0 },
    };
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_channel",
        params: { symbol: "$ch_0", name: "general" },
        status: "pending",
      },
      {
        index: 1,
        toolName: "add_role_to_member",
        params: { member_id: "m1", role_id: "$ch_0" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) => i.group === "B. Dependency" && i.message.includes("expects a role")
    );
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("block");
  });

  it("blocks when a role symbol is passed as parent_id", async () => {
    const symbolTable: SymbolTable = {
      $role_0: { symbol: "$role_0", type: "role", definingStepIndex: 0 },
    };
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_role",
        params: { symbol: "$role_0", name: "Mods" },
        status: "pending",
      },
      {
        index: 1,
        toolName: "create_channel",
        params: { name: "chat", parent_id: "$role_0" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const blocker = result.issues.find(
      (i) => i.group === "B. Dependency" && i.message.includes("expects a channel")
    );
    expect(blocker).toBeDefined();
  });

  it("passes when symbol types match their param expectations", async () => {
    const symbolTable: SymbolTable = {
      $cat_0: { symbol: "$cat_0", type: "channel", definingStepIndex: 0 },
      $role_0: { symbol: "$role_0", type: "role", definingStepIndex: 1 },
    };
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_category",
        params: { symbol: "$cat_0", name: "Text" },
        status: "pending",
      },
      {
        index: 1,
        toolName: "create_role",
        params: { symbol: "$role_0", name: "Mods" },
        status: "pending",
      },
      {
        index: 2,
        toolName: "create_channel",
        params: { name: "chat", parent_id: "$cat_0" },
        status: "pending",
      },
      {
        index: 3,
        toolName: "add_role_to_member",
        params: { member_id: "m1", role_id: "$role_0" },
        status: "pending",
      },
    ];

    const result = await validatePlan({
      steps,
      symbolTable,
      desiredState: emptyDesiredState,
      guildId: "g1",
      status: "draft",
    });

    const typeMismatch = result.issues.find(
      (i) => i.group === "B. Dependency" && i.message.includes("expects a")
    );
    expect(typeMismatch).toBeUndefined();
  });
});

describe("validatePlan bitrate constraint", () => {
  const emptyDesiredState: DesiredState = {
    guildId: "g1",
    guildName: "Test",
    active: { channels: {}, roles: {}, overwrites: {} },
    tombstones: [],
    symbolCounter: 0,
    version: 1,
  };
  const emptySymbolTable: SymbolTable = {};

  it("blocks bitrate on a text channel", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_channel",
        params: { name: "general", type: 0, bitrate: 64000 },
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
      (i) => i.group === "C. Resource" && i.message.includes("Bitrate can only be set")
    );
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("block");
  });

  it("allows bitrate on a voice channel", async () => {
    const steps: PlanStep[] = [
      {
        index: 0,
        toolName: "create_channel",
        params: { name: "Voice", type: 2, bitrate: 64000 },
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
      (i) => i.group === "C. Resource" && i.message.includes("Bitrate can only be set")
    );
    expect(blocker).toBeUndefined();
  });
});
