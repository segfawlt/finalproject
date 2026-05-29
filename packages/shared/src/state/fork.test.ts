import { describe, it, expect } from "vitest";
import { fork } from "./fork";

describe("fork", () => {
  it("populates memberRoles from ServerState", () => {
    const serverState = {
      guildId: "g1",
      guildName: "Test Guild",
      memberCount: 2,
      channels: [],
      roles: [],
      overwrites: [],
      memberRoles: [
        { memberId: "user-1", roleIds: ["role-1", "role-2"] },
        { memberId: "user-2", roleIds: ["role-2"] },
      ],
    };

    const result = fork(serverState);

    expect(result.active.memberRoles!["user-1"]).toEqual({
      memberId: "user-1",
      roleIds: ["role-1", "role-2"],
    });
    expect(result.active.memberRoles!["user-2"]).toEqual({
      memberId: "user-2",
      roleIds: ["role-2"],
    });
  });

  it("handles empty memberRoles", () => {
    const serverState = {
      guildId: "g1",
      guildName: "Test Guild",
      memberCount: 0,
      channels: [],
      roles: [],
      overwrites: [],
      memberRoles: [],
    };

    const result = fork(serverState);

    expect(result.active.memberRoles!).toEqual({});
  });
});
