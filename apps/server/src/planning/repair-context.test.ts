import { describe, expect, it } from "vitest";
import type { DesiredState, ServerState } from "@repo/shared";
import { buildRepairPrompt } from "./repair-context";

describe("buildRepairPrompt", () => {
  it("instructs the planner to replan from fresh state without executing", () => {
    const currentState: ServerState = {
      guildId: "guild-1",
      guildName: "Community",
      memberCount: 3,
      channels: [{ id: "channel-1", name: "lobby", type: 0, parentId: null, position: 0 }],
      roles: [],
      overwrites: [],
    };
    const previousDesiredState: DesiredState = {
      guildId: "guild-1",
      guildName: "Community",
      active: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
      tombstones: [],
      symbolCounter: 0,
      version: 1,
    };

    const prompt = buildRepairPrompt({
      currentState,
      previousDesiredState,
      conflicts: [
        {
          kind: "missing_resource",
          resourceType: "channel",
          resourceId: "channel-2",
          resourceName: "general",
          message: 'Channel "general" no longer exists.',
        },
      ],
    });

    expect(prompt).toContain("Fresh Discord state is authoritative");
    expect(prompt).toContain("Do not execute Discord changes");
    expect(prompt).toContain("channel-2");
    expect(prompt).toContain("lobby");
  });
});
