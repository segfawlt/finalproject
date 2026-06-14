import type {
  ServerState,
  DesiredState,
  ChannelBase,
  Role,
  PermissionOverwrite,
  MemberRoleAssignment,
} from "../types";

/**
 * Fork a ServerState (flat arrays, real Discord IDs) into a DesiredState
 * (keyed records, ready for LLM planning).
 */
export function fork(serverState: ServerState): DesiredState {
  const channels: Record<string, ChannelBase> = {};
  for (const ch of serverState.channels) {
    channels[ch.id] = structuredClone(ch);
  }

  const roles: Record<string, Role> = {};
  for (const role of serverState.roles) {
    roles[role.id] = structuredClone(role);
  }

  const overwrites: Record<string, PermissionOverwrite> = {};
  for (const ow of serverState.overwrites) {
    const key = `${ow.channelId}:${ow.roleId}`;
    overwrites[key] = structuredClone(ow);
  }

  const memberRoles: Record<string, MemberRoleAssignment> = {};
  for (const mr of serverState.memberRoles ?? []) {
    memberRoles[mr.memberId] = structuredClone(mr);
  }

  return {
    guildId: serverState.guildId,
    guildName: serverState.guildName,
    active: { channels, roles, overwrites, memberRoles },
    tombstones: [],
    symbolCounter: 0,
    version: 0,
  };
}
