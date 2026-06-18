/**
 * Pure diff helpers for "current Discord state vs planner's desired state".
 *
 * The desired state uses two kinds of keys:
 *   - Symbolic IDs (start with `$`) — new resources that don't exist on Discord yet
 *   - Real Discord IDs — existing resources the planner wants to edit/move/delete
 *
 * `tombstones` lists real IDs of resources that were already deleted from
 * Discord (e.g., a previous plan ran and removed them). If a desired item's
 * real ID is in tombstones, treat it as new — the resource is being recreated.
 *
 * Anything in the real state that the desired state omits is "removed" (will
 * be deleted by the next plan).
 */

import type {
  ChannelBase,
  Role,
  MemberRoleAssignment,
  Tombstone,
  ServerState,
  DesiredState,
  DiffStatus,
} from "./types";

function isSymbol(key: string): boolean {
  return key.startsWith("$");
}

function tombstoneIdsFor(
  tombstones: Tombstone[],
  resourceType: Tombstone["resourceType"]
): Set<string> {
  return new Set(tombstones.filter((t) => t.resourceType === resourceType).map((t) => t.discordId));
}

export interface DiffResult<T> {
  /** Diff status keyed by the desired-state key (symbol or real id). */
  byKey: Map<string, DiffStatus>;
  /** Real-state items absent from the desired state — will be deleted. */
  removed: T[];
}

function diffByKey<T>(
  desired: Record<string, T>,
  real: T[],
  tombstoneSet: Set<string>,
  getKey: (item: T) => string,
  detectChanges: (d: T, r: T) => boolean
): DiffResult<T> {
  const realByKey = new Map(real.map((r) => [getKey(r), r]));
  const byKey = new Map<string, DiffStatus>();
  const removed: T[] = [];

  for (const [key, item] of Object.entries(desired)) {
    if (isSymbol(key) || tombstoneSet.has(key)) {
      byKey.set(key, "new");
      continue;
    }
    const realItem = realByKey.get(key);
    if (!realItem) {
      byKey.set(key, "new");
      continue;
    }
    byKey.set(key, detectChanges(item, realItem) ? "modified" : "unchanged");
  }

  for (const r of real) {
    if (!desired[getKey(r)]) {
      removed.push(r);
    }
  }

  return { byKey, removed };
}

function channelChanges(d: ChannelBase, r: ChannelBase): boolean {
  if (d.name !== r.name) return true;
  if (d.type !== r.type) return true;
  if (d.parentId !== r.parentId) return true;
  if (d.position !== r.position) return true;
  if ((d.topic ?? null) !== (r.topic ?? null)) return true;
  if ((d.lockPermissions ?? null) !== (r.lockPermissions ?? null)) return true;
  return false;
}

function roleChanges(d: Role, r: Role): boolean {
  if (d.name !== r.name) return true;
  if (d.position !== r.position) return true;
  if (d.color !== r.color) return true;
  if (d.hoist !== r.hoist) return true;
  if (d.mentionable !== r.mentionable) return true;
  if (d.permissions.length !== r.permissions.length) return true;
  const a = new Set(d.permissions);
  for (const p of r.permissions) {
    if (!a.has(p)) return true;
  }
  return false;
}

function memberRoleChanges(d: MemberRoleAssignment, r: MemberRoleAssignment): boolean {
  if (d.roleIds.length !== r.roleIds.length) return true;
  const a = new Set(d.roleIds);
  for (const id of r.roleIds) {
    if (!a.has(id)) return true;
  }
  return false;
}

export function diffChannels(
  desired: Record<string, ChannelBase>,
  real: ChannelBase[],
  tombstones: Tombstone[]
): DiffResult<ChannelBase> {
  return diffByKey(
    desired,
    real,
    tombstoneIdsFor(tombstones, "channel"),
    (c) => c.id,
    channelChanges
  );
}

export function diffRoles(
  desired: Record<string, Role>,
  real: Role[],
  tombstones: Tombstone[]
): DiffResult<Role> {
  return diffByKey(desired, real, tombstoneIdsFor(tombstones, "role"), (r) => r.id, roleChanges);
}

export function diffMemberRoles(
  desired: Record<string, MemberRoleAssignment>,
  real: MemberRoleAssignment[]
): DiffResult<MemberRoleAssignment> {
  // Member-role assignments are not tombstoned — no real-id mapping.
  return diffByKey(desired, real, new Set(), (a) => a.memberId, memberRoleChanges);
}

export interface FullDiff {
  channels: DiffResult<ChannelBase>;
  roles: DiffResult<Role>;
  memberRoles: DiffResult<MemberRoleAssignment>;
}

export function computeFullDiff(
  desired: DesiredState["active"],
  current: ServerState | null,
  tombstones: Tombstone[]
): FullDiff | null {
  if (!current) return null;
  return {
    channels: diffChannels(desired.channels, current.channels, tombstones),
    roles: diffRoles(desired.roles, current.roles, tombstones),
    memberRoles: diffMemberRoles(desired.memberRoles ?? {}, current.memberRoles ?? []),
  };
}

// Re-export for callers that don't want to import from types directly
export type { DiffStatus } from "./types";
