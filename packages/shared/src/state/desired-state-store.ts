import type { DesiredState, ServerState, ChannelBase, Role } from "../types";

const SYMBOL_PREFIXES = {
  channel: "$ch_",
  category: "$cat_",
  role: "$role_",
} as const;

/**
 * DesiredStateStore — the middleware layer between tool plan() functions
 * and the DesiredState structure. Owns all mutation, validation,
 * symbol generation, and snapshot logic.
 *
 * All validation happens BEFORE any mutation. If validation throws,
 * the DesiredState is guaranteed unchanged (no partial state).
 */
export class DesiredStateStore {
  private state: DesiredState;

  constructor(initialState?: DesiredState) {
    this.state = initialState ?? {
      guildId: "",
      guildName: "",
      active: { channels: {}, roles: {}, overwrites: {}, memberRoles: {} },
      tombstones: [],
      symbolCounter: 0,
      version: 0,
    };
  }

  /** Read-only access to current DesiredState. */
  getState(): DesiredState {
    return this.state;
  }

  /** Deep-clone current state for persistence. */
  snapshot(): DesiredState {
    return JSON.parse(JSON.stringify(this.state));
  }

  /** Replace current state with a prior snapshot (for cancellation / revert). */
  revert(snapshot: DesiredState): void {
    this.state = JSON.parse(JSON.stringify(snapshot));
  }

  // ── Fork ───────────────────────────────────────────────────────────────────

  /** Create a store from real Discord state. All items keyed by Discord ID. */
  static fork(serverState: ServerState): DesiredStateStore {
    const store = new DesiredStateStore();
    store.state.guildId = serverState.guildId;
    store.state.guildName = serverState.guildName;
    store.state.symbolCounter = 0;
    store.state.version = 0;
    store.state.tombstones = [];

    for (const ch of serverState.channels) {
      store.state.active.channels[ch.id] = { ...ch };
    }

    for (const role of serverState.roles) {
      store.state.active.roles[role.id] = { ...role };
    }

    for (const ow of serverState.overwrites) {
      const key = `${ow.channelId}:${ow.roleId}`;
      store.state.active.overwrites[key] = { ...ow };
    }

    return store;
  }

  // ── Symbols ────────────────────────────────────────────────────────────────

  /** Generate and return the next symbol for a resource type (e.g. "$ch_0"). */
  nextSymbol(type: "channel" | "category" | "role"): string {
    const prefix = SYMBOL_PREFIXES[type];
    const symbol = `${prefix}${this.state.symbolCounter}`;
    this.state.symbolCounter++;
    return symbol;
  }

  // ── Channels ─────────────────────────────────────────────────────────────────

  addChannel(params: {
    name: string;
    type: number;
    parentId?: string | null;
    position?: number;
    topic?: string | null;
    bitrate?: number;
    userLimit?: number;
    nsfw?: boolean;
    rateLimitPerUser?: number;
    messageCount?: number;
    availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
    defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
    defaultSortOrder?: number | null;
    defaultForumLayout?: number;
    defaultThreadRateLimitPerUser?: number;
    flags?: number;
    lockPermissions?: boolean;
  }): string {
    this.validateUniqueChannelName(params.name);
    const symbol = this.nextSymbol("channel");

    const channel: ChannelBase = {
      id: symbol,
      name: params.name,
      type: params.type,
      parentId: params.parentId ?? null,
      position: params.position ?? 0,
      messageCount: params.messageCount,
    };

    // Attach optional Discord-specific fields that exist on subtypes
    if (params.topic !== undefined) channel.topic = params.topic;
    if (params.bitrate !== undefined) channel.bitrate = params.bitrate;
    if (params.userLimit !== undefined) channel.userLimit = params.userLimit;
    if (params.nsfw !== undefined) channel.nsfw = params.nsfw;
    if (params.rateLimitPerUser !== undefined) channel.rateLimitPerUser = params.rateLimitPerUser;
    if (params.availableTags !== undefined) channel.availableTags = params.availableTags;
    if (params.defaultReactionEmoji !== undefined) channel.defaultReactionEmoji = params.defaultReactionEmoji;
    if (params.defaultSortOrder !== undefined) channel.defaultSortOrder = params.defaultSortOrder;
    if (params.defaultForumLayout !== undefined) channel.defaultForumLayout = params.defaultForumLayout;
    if (params.defaultThreadRateLimitPerUser !== undefined) channel.defaultThreadRateLimitPerUser = params.defaultThreadRateLimitPerUser;
    if (params.flags !== undefined) channel.flags = params.flags;
    if (params.lockPermissions !== undefined) channel.lockPermissions = params.lockPermissions;

    this.state.active.channels[symbol] = channel;
    return symbol;
  }

  editChannel(
    id: string,
    fields: Partial<
      ChannelBase & {
        topic?: string | null;
        bitrate?: number;
        userLimit?: number;
        nsfw?: boolean;
        rateLimitPerUser?: number;
        availableTags?: Array<{ name: string; moderated?: boolean; emojiId?: string | null; emojiName?: string | null }>;
        defaultReactionEmoji?: { emojiId?: string | null; emojiName?: string | null } | null;
        defaultSortOrder?: number | null;
        defaultForumLayout?: number;
        defaultThreadRateLimitPerUser?: number;
        flags?: number;
      }
    >
  ): void {
    const existing = this.state.active.channels[id];
    if (!existing) {
      throw new Error(`Channel or category ${id} not found in desired state`);
    }

    if (fields.name !== undefined) {
      this.validateUniqueChannelName(fields.name, /* excludeId */ id);
    }

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        (existing as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  removeChannel(id: string): void {
    const existing = this.state.active.channels[id];
    if (!existing) {
      throw new Error(`Channel or category ${id} not found in desired state`);
    }

    delete this.state.active.channels[id];
    this.state.tombstones.push({
      discordId: existing.id,
      resourceType: existing.type === 4 ? "category" : "channel",
      name: existing.name,
      deletedInVersion: this.state.version,
    });
  }

  // ── Categories (channels with type === 4) ──────────────────────────────────

  addCategory(params: { name: string; position?: number }): string {
    this.validateUniqueChannelName(params.name);
    const symbol = this.nextSymbol("category");

    const category: ChannelBase = {
      id: symbol,
      name: params.name,
      type: 4,
      parentId: null,
      position: params.position ?? 0,
    };

    this.state.active.channels[symbol] = category;
    return symbol;
  }

  editCategory(id: string, fields: Partial<ChannelBase>): void {
    // Categories live in the channels record; reuse editChannel logic
    this.editChannel(id, fields);
  }

  removeCategory(id: string): void {
    this.removeChannel(id);
  }

  // ── Roles ────────────────────────────────────────────────────────────────────

  addRole(params: {
    name: string;
    permissions?: string[];
    color?: number;
    hoist?: boolean;
    mentionable?: boolean;
    position?: number;
    memberCount?: number;
  }): string {
    this.validateUniqueRoleName(params.name);
    const symbol = this.nextSymbol("role");

    const role: Role = {
      id: symbol,
      name: params.name,
      permissions: params.permissions ?? [],
      color: params.color ?? 0,
      hoist: params.hoist ?? false,
      mentionable: params.mentionable ?? false,
      position: params.position ?? 0,
      memberCount: params.memberCount,
    };

    this.state.active.roles[symbol] = role;
    return symbol;
  }

  editRole(id: string, fields: Partial<Role>): void {
    const existing = this.state.active.roles[id];
    if (!existing) {
      throw new Error(`Role ${id} not found in desired state`);
    }

    if (fields.name !== undefined) {
      this.validateUniqueRoleName(fields.name, /* excludeId */ id);
    }

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        (existing as unknown as Record<string, unknown>)[key] = value;
      }
    }
  }

  removeRole(id: string): void {
    const existing = this.state.active.roles[id];
    if (!existing) {
      throw new Error(`Role ${id} not found in desired state`);
    }

    delete this.state.active.roles[id];
    this.state.tombstones.push({
      discordId: existing.id,
      resourceType: "role",
      name: existing.name,
      deletedInVersion: this.state.version,
    });
  }

  // ── Overwrites ───────────────────────────────────────────────────────────────

  setOverwrite(channelId: string, roleId: string, allow?: string[], deny?: string[]): void {
    this.validateReference(channelId, "channel");
    this.validateReference(roleId, "role");

    const key = `${channelId}:${roleId}`;
    this.state.active.overwrites[key] = {
      channelId,
      roleId,
      allow: allow ?? [],
      deny: deny ?? [],
    };
  }

  removeOverwrite(channelId: string, roleId: string): void {
    this.validateReference(channelId, "channel");
    this.validateReference(roleId, "role");

    const key = `${channelId}:${roleId}`;
    delete this.state.active.overwrites[key];
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  addMemberRole(memberId: string, roleId: string): void {
    this.validateReference(roleId, "role");

    const existing = this.state.active.memberRoles?.[memberId];
    if (!existing) {
      this.state.active.memberRoles ??= {};
      this.state.active.memberRoles[memberId] = {
        memberId,
        roleIds: [roleId],
      };
      return;
    }

    if (!existing.roleIds.includes(roleId)) {
      existing.roleIds.push(roleId);
    }
  }

  removeMemberRole(memberId: string, roleId: string): void {
    const existing = this.state.active.memberRoles?.[memberId];
    if (!existing) {
      throw new Error(`Member ${memberId} not found in desired state`);
    }

    const idx = existing.roleIds.indexOf(roleId);
    if (idx === -1) {
      throw new Error(`Role ${roleId} not found in member ${memberId}'s roles`);
    }

    existing.roleIds.splice(idx, 1);
  }

  // ── Validation helpers (private) ───────────────────────────────────────────

  private validateUniqueChannelName(name: string, excludeId?: string): void {
    for (const [key, ch] of Object.entries(this.state.active.channels)) {
      if (key !== excludeId && ch.name === name) {
        throw new Error(`A channel or category named "${name}" already exists in desired state`);
      }
    }
  }

  private validateUniqueRoleName(name: string, excludeId?: string): void {
    for (const [key, role] of Object.entries(this.state.active.roles)) {
      if (key !== excludeId && role.name === name) {
        throw new Error(`A role named "${name}" already exists in desired state`);
      }
    }
  }

  private validateReference(id: string, type: "channel" | "role"): void {
    if (type === "channel") {
      if (!this.state.active.channels[id]) {
        throw new Error(`Channel or category ${id} not found in desired state`);
      }
    } else {
      if (!this.state.active.roles[id]) {
        throw new Error(`Role ${id} not found in desired state`);
      }
    }
  }
}
