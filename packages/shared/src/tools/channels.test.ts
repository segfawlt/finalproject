import { describe, it, expect, vi } from "vitest";
import { DesiredStateStore } from "../state";
import {
  createChannelSchema,
  editChannelSchema,
  channelTypeEnum,
  planChannelCreate,
  planChannelEdit,
  executeChannelCreate,
  executeChannelEdit,
} from "./channels";
import type { ExecuteContext } from "../execute-context";

describe("channelTypeEnum", () => {
  it("includes media type", () => {
    expect(channelTypeEnum.options).toContain("media");
  });

  it("maps media to type 16", () => {
    const params = {
      name: "test-media",
      type: "media",
    };
    const parsed = createChannelSchema.parse(params);
    expect(parsed.type).toBe("media");
  });
});

describe("createChannelSchema", () => {
  it("parses forum properties", () => {
    const params = {
      name: "test-forum",
      type: "forum" as const,
      available_tags: [
        { name: "Bug", moderated: true },
        { name: "Feature", emoji_id: "123", emoji_name: "🐛" },
      ],
      default_reaction_emoji: { emoji_id: "456", emoji_name: "👍" },
      default_sort_order: 1,
      default_forum_layout: 2,
      default_thread_rate_limit_per_user: 60,
      flags: 16,
    };
    const parsed = createChannelSchema.parse(params);
    expect(parsed.available_tags).toHaveLength(2);
    expect(parsed.available_tags?.[0].name).toBe("Bug");
    expect(parsed.default_sort_order).toBe(1);
    expect(parsed.flags).toBe(16);
  });

  it("parses without forum properties", () => {
    const params = {
      name: "text-only",
      type: "text" as const,
    };
    const parsed = createChannelSchema.parse(params);
    expect(parsed.available_tags).toBeUndefined();
    expect(parsed.flags).toBeUndefined();
  });
});

describe("editChannelSchema", () => {
  it("parses forum property updates", () => {
    const params = {
      id: "abc123",
      available_tags: [{ name: "Updated" }],
      flags: 0,
    };
    const parsed = editChannelSchema.parse(params);
    expect(parsed.available_tags).toHaveLength(1);
    expect(parsed.flags).toBe(0);
  });
});

describe("planChannelCreate", () => {
  it("stores forum properties in desired state", () => {
    const store = new DesiredStateStore();
    const params = {
      name: "bugs",
      type: "forum" as const,
      available_tags: [{ name: "Critical" }],
      default_sort_order: 1 as const,
      flags: 16,
    };

    planChannelCreate(params, store);
    const state = store.getState();
    const channel = Object.values(state.active.channels)[0];

    expect(channel).toBeDefined();
    expect(channel.name).toBe("bugs");
    expect(channel.type).toBe(15);
    expect(channel.availableTags).toEqual([{ name: "Critical" }]);
    expect(channel.defaultSortOrder).toBe(1);
    expect(channel.flags).toBe(16);
  });

  it("stores media channel with type 16", () => {
    const store = new DesiredStateStore();
    const params = {
      name: "media-gallery",
      type: "media" as const,
    };

    planChannelCreate(params, store);
    const state = store.getState();
    const channel = Object.values(state.active.channels)[0];

    expect(channel.type).toBe(16);
  });
});

describe("planChannelEdit", () => {
  it("updates forum properties on existing channel", () => {
    const store = new DesiredStateStore();
    // Create a channel first
    const createResult = planChannelCreate(
      { name: "original", type: "forum" as const },
      store
    );
    const symbol = createResult.symbol!;

    // Edit with forum properties
    planChannelEdit(
      {
        id: symbol,
        available_tags: [{ name: "NewTag" }],
        default_forum_layout: 1,
      },
      store
    );

    const state = store.getState();
    const channel = state.active.channels[symbol];

    expect(channel.availableTags).toEqual([{ name: "NewTag" }]);
    expect(channel.defaultForumLayout).toBe(1);
  });
});

describe("createChannelSchema — lock_permissions", () => {
  it("parses lock_permissions: true", () => {
    const parsed = createChannelSchema.parse({
      name: "synced-channel",
      type: "text",
      lock_permissions: true,
    });
    expect(parsed.lock_permissions).toBe(true);
  });

  it("parses lock_permissions: false", () => {
    const parsed = createChannelSchema.parse({
      name: "independent-channel",
      type: "text",
      lock_permissions: false,
    });
    expect(parsed.lock_permissions).toBe(false);
  });

  it("omits lock_permissions by default", () => {
    const parsed = createChannelSchema.parse({
      name: "basic",
      type: "text",
    });
    expect(parsed.lock_permissions).toBeUndefined();
  });
});

describe("editChannelSchema — lock_permissions", () => {
  it("parses lock_permissions in edit", () => {
    const parsed = editChannelSchema.parse({
      id: "abc",
      lock_permissions: true,
    });
    expect(parsed.lock_permissions).toBe(true);
  });
});

describe("planChannelCreate — lockPermissions", () => {
  it("stores lockPermissions: true on channel", () => {
    const store = new DesiredStateStore();
    planChannelCreate(
      { name: "synced", type: "text" as const, lock_permissions: true },
      store
    );
    const state = store.getState();
    const channel = Object.values(state.active.channels)[0];
    expect(channel.lockPermissions).toBe(true);
  });

  it("stores lockPermissions: false on channel", () => {
    const store = new DesiredStateStore();
    planChannelCreate(
      { name: "unsynced", type: "text" as const, lock_permissions: false },
      store
    );
    const state = store.getState();
    const channel = Object.values(state.active.channels)[0];
    expect(channel.lockPermissions).toBe(false);
  });
});

describe("planChannelEdit — lockPermissions", () => {
  it("updates lockPermissions on existing channel", () => {
    const store = new DesiredStateStore();
    const result = planChannelCreate(
      { name: "test", type: "text" as const, lock_permissions: true },
      store
    );
    planChannelEdit(
      { id: result.symbol!, lock_permissions: false },
      store
    );
    const state = store.getState();
    const channel = state.active.channels[result.symbol!];
    expect(channel.lockPermissions).toBe(false);
  });
});

describe("executeChannelCreate — lockPermissions", () => {
  it("passes lockPermissions to context", async () => {
    const ctx = {
      guildId: "g1",
      createChannel: vi.fn().mockResolvedValue({ id: "ch-1" }),
      editChannel: vi.fn(),
      deleteChannel: vi.fn(),
      moveChannel: vi.fn(),
      createRole: vi.fn(),
      editRole: vi.fn(),
      deleteRole: vi.fn(),
      moveRole: vi.fn(),
      setOverwrite: vi.fn(),
      removeOverwrite: vi.fn(),
      addRoleToMember: vi.fn(),
      removeRoleFromMember: vi.fn(),
    } as ExecuteContext;

    await executeChannelCreate(
      { name: "synced", type: "text", lock_permissions: true },
      ctx
    );
    expect(ctx.createChannel).toHaveBeenCalledWith(
      "synced",
      0,
      expect.objectContaining({ lockPermissions: true })
    );
  });
});

describe("executeChannelEdit — lockPermissions", () => {
  it("passes lockPermissions to context on edit", async () => {
    const ctx = {
      guildId: "g1",
      createChannel: vi.fn(),
      editChannel: vi.fn().mockResolvedValue(undefined),
      deleteChannel: vi.fn(),
      moveChannel: vi.fn(),
      createRole: vi.fn(),
      editRole: vi.fn(),
      deleteRole: vi.fn(),
      moveRole: vi.fn(),
      setOverwrite: vi.fn(),
      removeOverwrite: vi.fn(),
      addRoleToMember: vi.fn(),
      removeRoleFromMember: vi.fn(),
    } as ExecuteContext;

    await executeChannelEdit(
      { id: "ch-1", lock_permissions: false },
      ctx
    );
    expect(ctx.editChannel).toHaveBeenCalledWith(
      "ch-1",
      expect.objectContaining({ lockPermissions: false })
    );
  });
});
