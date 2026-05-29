import { describe, it, expect } from "vitest";
import { DesiredStateStore } from "./desired-state-store";

describe("DesiredStateStore.addMemberRole", () => {
  it("creates a new MemberRoleAssignment for a new member", () => {
    const store = new DesiredStateStore();
    store.addRole({ name: "Admin" });
    const roleSymbol = Object.keys(store.getState().active.roles)[0];

    store.addMemberRole("user-1", roleSymbol);

    const state = store.getState();
    expect(state.active.memberRoles!!["user-1"]).toEqual({
      memberId: "user-1",
      roleIds: [roleSymbol],
    });
  });

  it("adds a second role to an existing member", () => {
    const store = new DesiredStateStore();
    store.addRole({ name: "Admin" });
    store.addRole({ name: "Mod" });
    const [roleA, roleB] = Object.keys(store.getState().active.roles);

    store.addMemberRole("user-1", roleA);
    store.addMemberRole("user-1", roleB);

    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).toEqual([roleA, roleB]);
  });

  it("throws if the role does not exist in desired state", () => {
    const store = new DesiredStateStore();

    expect(() => store.addMemberRole("user-1", "nonexistent-role")).toThrow(
      "Role nonexistent-role not found in desired state"
    );
  });

  it("is idempotent — adding the same role twice does not duplicate", () => {
    const store = new DesiredStateStore();
    store.addRole({ name: "Admin" });
    const roleSymbol = Object.keys(store.getState().active.roles)[0];

    store.addMemberRole("user-1", roleSymbol);
    store.addMemberRole("user-1", roleSymbol);

    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).toEqual([roleSymbol]);
  });
});

describe("DesiredStateStore.removeMemberRole", () => {
  it("removes a role from a member", () => {
    const store = new DesiredStateStore();
    store.addRole({ name: "Admin" });
    store.addRole({ name: "Mod" });
    const [roleA, roleB] = Object.keys(store.getState().active.roles);
    store.addMemberRole("user-1", roleA);
    store.addMemberRole("user-1", roleB);

    store.removeMemberRole("user-1", roleA);

    const state = store.getState();
    expect(state.active.memberRoles!["user-1"].roleIds).toEqual([roleB]);
  });

  it("throws if the member does not exist", () => {
    const store = new DesiredStateStore();

    expect(() => store.removeMemberRole("user-1", "some-role")).toThrow(
      "Member user-1 not found in desired state"
    );
  });

  it("throws if the role is not assigned to the member", () => {
    const store = new DesiredStateStore();
    store.addRole({ name: "Admin" });
    const roleSymbol = Object.keys(store.getState().active.roles)[0];
    store.addMemberRole("user-1", roleSymbol);

    expect(() => store.removeMemberRole("user-1", "other-role")).toThrow(
      "Role other-role not found in member user-1's roles"
    );
  });
});
