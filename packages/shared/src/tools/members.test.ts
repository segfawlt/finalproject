import { describe, it, expect } from "vitest";
import { DesiredStateStore } from "../state";
import type { ExecuteContext } from "../execute-context";
import {
  createMemberRoleSchema,
  removeMemberRoleSchema,
  planMemberRoleAdd,
  planMemberRoleRemove,
  executeMemberRoleAdd,
  executeMemberRoleRemove,
  getMemberRoleAddAssumptions,
  getMemberRoleRemoveAssumptions,
} from "./members";

describe("createMemberRoleSchema", () => {
  it("parses member_id and role_id", () => {
    const parsed = createMemberRoleSchema.parse({
      member_id: "user_123",
      role_id: "role_456",
    });
    expect(parsed.member_id).toBe("user_123");
    expect(parsed.role_id).toBe("role_456");
  });

  it("rejects missing member_id", () => {
    expect(() => createMemberRoleSchema.parse({ role_id: "r1" })).toThrow();
  });

  it("rejects missing role_id", () => {
    expect(() => createMemberRoleSchema.parse({ member_id: "u1" })).toThrow();
  });
});

describe("removeMemberRoleSchema", () => {
  it("parses member_id and role_id", () => {
    const parsed = removeMemberRoleSchema.parse({
      member_id: "user_123",
      role_id: "role_456",
    });
    expect(parsed.member_id).toBe("user_123");
    expect(parsed.role_id).toBe("role_456");
  });
});

describe("planMemberRoleAdd", () => {
  it("adds a role to a member in desired state", () => {
    const store = new DesiredStateStore();
    const roleSym = store.addRole({ name: "Admin" });

    const result = planMemberRoleAdd(
      { member_id: "user-1", role_id: roleSym },
      store
    );

    expect(result.planned).toBe(true);
    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).toContain(roleSym);
  });

  it("is idempotent for duplicate adds", () => {
    const store = new DesiredStateStore();
    const roleSym = store.addRole({ name: "Admin" });

    planMemberRoleAdd({ member_id: "user-1", role_id: roleSym }, store);
    planMemberRoleAdd({ member_id: "user-1", role_id: roleSym }, store);

    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).toHaveLength(1);
  });
});

describe("planMemberRoleRemove", () => {
  it("removes a role from a member in desired state", () => {
    const store = new DesiredStateStore();
    const roleSym = store.addRole({ name: "Admin" });
    store.addMemberRole("user-1", roleSym);

    const result = planMemberRoleRemove(
      { member_id: "user-1", role_id: roleSym },
      store
    );

    expect(result.planned).toBe(true);
    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).not.toContain(roleSym);
  });
});

describe("executeMemberRoleAdd", () => {
  it("calls ctx.addRoleToMember with resolved IDs", async () => {
    const calls: Array<{ memberId: string; roleId: string }> = [];
    const mockCtx: ExecuteContext = {
      guildId: "g1",
      addRoleToMember: async (memberId: string, roleId: string) => {
        calls.push({ memberId, roleId });
      },
    } as unknown as ExecuteContext;

    await executeMemberRoleAdd(
      { member_id: "user-1", role_id: "role-1" },
      mockCtx
    );

    expect(calls).toEqual([{ memberId: "user-1", roleId: "role-1" }]);
  });
});

describe("executeMemberRoleRemove", () => {
  it("calls ctx.removeRoleFromMember with resolved IDs", async () => {
    const calls: Array<{ memberId: string; roleId: string }> = [];
    const mockCtx: ExecuteContext = {
      guildId: "g1",
      removeRoleFromMember: async (memberId: string, roleId: string) => {
        calls.push({ memberId, roleId });
      },
    } as unknown as ExecuteContext;

    await executeMemberRoleRemove(
      { member_id: "user-1", role_id: "role-1" },
      mockCtx
    );

    expect(calls).toEqual([{ memberId: "user-1", roleId: "role-1" }]);
  });
});

describe("getMemberRoleAddAssumptions", () => {
  it("returns member_exists and role_assigned assumptions", () => {
    const assumptions = getMemberRoleAddAssumptions({
      member_id: "user-1",
      role_id: "role-1",
    });

    expect(assumptions).toHaveLength(2);
    expect(assumptions[0].type).toBe("member_exists");
    expect(assumptions[0].value).toBe("user-1");
    expect(assumptions[1].type).toBe("role_assigned");
    expect(assumptions[1].value).toBe("role-1");
  });
});

describe("getMemberRoleRemoveAssumptions", () => {
  it("returns member_exists and role_assigned assumptions", () => {
    const assumptions = getMemberRoleRemoveAssumptions({
      member_id: "user-1",
      role_id: "role-1",
    });

    expect(assumptions).toHaveLength(2);
    expect(assumptions[0].type).toBe("member_exists");
    expect(assumptions[0].value).toBe("user-1");
    expect(assumptions[1].type).toBe("role_assigned");
    expect(assumptions[1].value).toBe("role-1");
  });
});
