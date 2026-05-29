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
