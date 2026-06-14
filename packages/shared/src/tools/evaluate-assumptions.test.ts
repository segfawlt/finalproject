import { describe, it, expect } from "vitest";
import { evaluateAssumptions } from "./evaluate-assumptions";

describe("evaluateAssumptions — member types", () => {
  it("passes member_exists when member is in memberRoles", () => {
    const state = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 1,
      channels: [],
      roles: [],
      overwrites: [],
      memberRoles: [{ memberId: "user-1", roleIds: ["role-1"] }],
    };

    const results = evaluateAssumptions(
      [
        {
          type: "member_exists",
          value: "user-1",
          resourceType: "member",
          checked: false,
          status: "pending",
        },
      ],
      state
    );

    expect(results[0].passed).toBe(true);
    expect(results[0].message).toContain("user-1");
  });

  it("fails member_exists when member is not in memberRoles", () => {
    const state = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 0,
      channels: [],
      roles: [],
      overwrites: [],
      memberRoles: [],
    };

    const results = evaluateAssumptions(
      [
        {
          type: "member_exists",
          value: "user-1",
          resourceType: "member",
          checked: false,
          status: "pending",
        },
      ],
      state
    );

    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain("user-1");
  });

  it("passes role_assigned when role exists in server", () => {
    const state = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 0,
      channels: [],
      roles: [{ id: "role-1", name: "Admin", position: 1, permissions: [], color: 0, hoist: false, mentionable: false }],
      overwrites: [],
      memberRoles: [],
    };

    const results = evaluateAssumptions(
      [
        {
          type: "role_assigned",
          value: "role-1",
          resourceType: "role",
          checked: false,
          status: "pending",
        },
      ],
      state
    );

    expect(results[0].passed).toBe(true);
  });

  it("fails role_assigned when role does not exist", () => {
    const state = {
      guildId: "g1",
      guildName: "Test",
      memberCount: 0,
      channels: [],
      roles: [],
      overwrites: [],
      memberRoles: [],
    };

    const results = evaluateAssumptions(
      [
        {
          type: "role_assigned",
          value: "role-1",
          resourceType: "role",
          checked: false,
          status: "pending",
        },
      ],
      state
    );

    expect(results[0].passed).toBe(false);
  });
});

describe("evaluateAssumptions — unique_name with excludeId", () => {
  const makeState = (channels: Array<{ id: string; name: string; type: number }>) => ({
    guildId: "g1",
    guildName: "Test",
    memberCount: 0,
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: null,
      position: 0,
    })),
    roles: [],
    overwrites: [],
    memberRoles: [],
  });

  it("passes channel unique_name when match is the excluded self", () => {
    const state = makeState([{ id: "ch-1", name: "general", type: 0 }]);
    const results = evaluateAssumptions(
      [
        {
          type: "unique_name",
          value: "general",
          resourceType: "channel",
          checked: false,
          status: "pending",
          excludeId: "ch-1",
        },
      ],
      state
    );
    expect(results[0].passed).toBe(true);
  });

  it("fails channel unique_name when a different channel has the name", () => {
    const state = makeState([{ id: "ch-1", name: "general", type: 0 }]);
    const results = evaluateAssumptions(
      [
        {
          type: "unique_name",
          value: "general",
          resourceType: "channel",
          checked: false,
          status: "pending",
          excludeId: "ch-2",
        },
      ],
      state
    );
    expect(results[0].passed).toBe(false);
  });

  it("passes category unique_name when match is the excluded self", () => {
    const state = makeState([{ id: "cat-1", name: "Discussion", type: 4 }]);
    const results = evaluateAssumptions(
      [
        {
          type: "unique_name",
          value: "Discussion",
          resourceType: "category",
          checked: false,
          status: "pending",
          excludeId: "cat-1",
        },
      ],
      state
    );
    expect(results[0].passed).toBe(true);
  });

  it("fails category unique_name when a channel has the same name", () => {
    const state = makeState([
      { id: "ch-1", name: "Discussion", type: 0 },
    ]);
    const results = evaluateAssumptions(
      [
        {
          type: "unique_name",
          value: "Discussion",
          resourceType: "category",
          checked: false,
          status: "pending",
        },
      ],
      state
    );
    expect(results[0].passed).toBe(false);
  });
});

describe("evaluateAssumptions — warn_everyone_view normalization", () => {
  const baseState = {
    guildId: "guild-id-123",
    guildName: "Test",
    memberCount: 0,
    channels: [],
    roles: [],
    overwrites: [],
    memberRoles: [],
  };

  it("fails when role_id is the @everyone literal", () => {
    const results = evaluateAssumptions(
      [
        {
          type: "warn_everyone_view",
          value: "@everyone",
          resourceType: "channel",
          checked: false,
          status: "pending",
        },
      ],
      baseState
    );
    expect(results[0].passed).toBe(false);
  });

  it("fails when role_id equals the guild id (real @everyone representation)", () => {
    const results = evaluateAssumptions(
      [
        {
          type: "warn_everyone_view",
          value: "guild-id-123",
          resourceType: "channel",
          checked: false,
          status: "pending",
        },
      ],
      baseState
    );
    expect(results[0].passed).toBe(false);
  });

  it("passes when role_id is a regular role", () => {
    const results = evaluateAssumptions(
      [
        {
          type: "warn_everyone_view",
          value: "role-1",
          resourceType: "channel",
          checked: false,
          status: "pending",
        },
      ],
      baseState
    );
    expect(results[0].passed).toBe(true);
  });
});
