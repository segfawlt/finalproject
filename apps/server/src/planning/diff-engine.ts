import type {
  ChannelBase,
  DesiredState,
  ServerState,
  Role,
  PermissionOverwrite,
  MemberRoleAssignment,
  PlanStep,
  SymbolTable,
} from "@repo/shared";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DiffResult {
  steps: PlanStep[];
  symbolTable: SymbolTable;
}

interface RawStep {
  toolName: string;
  params: Record<string, unknown>;
  // For dependency tracking during Phase 2
  symbolsReferenced: string[];
  // For merge optimization in Phase 3
  targetId?: string;
}

// ── Tool order for topological sort (lower = earlier) ──────────────────────

const TOOL_ORDER: Record<string, number> = {
  create_category: 1,
  create_channel: 2,
  create_role: 3,
  edit_category: 4,
  edit_channel: 5,
  edit_role: 6,
  move_channel: 7,
  move_role: 8,
  add_role_to_member: 9,
  remove_role_from_member: 10,
  set_overwrite: 11,
  remove_overwrite: 12,
  delete_channel: 13,
  delete_role: 14,
  delete_category: 15,
};

// ── Phase 1: Generate Raw Steps ─────────────────────────────────────────────

function isSymbol(key: string): boolean {
  return key.startsWith("$");
}

function generateChannelSteps(
  desired: Record<string, ChannelBase>,
  real: ChannelBase[]
): RawStep[] {
  const steps: RawStep[] = [];
  const realById = new Map(real.map((c) => [c.id, c]));

  for (const [key, ch] of Object.entries(desired)) {
    if (isSymbol(key)) {
      // NEW channel
      const params: Record<string, unknown> = {
        name: ch.name,
        type: ch.type,
        symbol: key,
      };
      if (ch.parentId != null) params.parent_id = ch.parentId;
      if (ch.position !== 0) params.position = ch.position;
      if ((ch as { topic?: string }).topic != null) {
        params.topic = (ch as { topic?: string }).topic;
      }
      if (ch.lockPermissions !== undefined) {
        params.lock_permissions = ch.lockPermissions;
      }

      steps.push({
        toolName: ch.type === 4 ? "create_category" : "create_channel",
        params,
        symbolsReferenced: ch.parentId && isSymbol(ch.parentId) ? [ch.parentId] : [],
      });
    } else {
      // EXISTING channel — match by Discord ID
      const realCh = realById.get(key);
      if (!realCh) {
        // External deletion — validation should catch this before diff is called.
        // Throw here so the caller knows something is wrong.
        throw new Error(
          `Channel ${key} (${ch.name}) exists in DesiredState but was deleted externally`
        );
      }

      const editDiff: Record<string, unknown> = { id: key };
      const moveDiff: Record<string, unknown> = { id: key };

      if (ch.name !== realCh.name) editDiff.name = ch.name;
      if (ch.type !== realCh.type) editDiff.type = ch.type;
      if ((ch as { topic?: string }).topic !== (realCh as { topic?: string }).topic) {
        editDiff.topic = (ch as { topic?: string }).topic;
      }
      if (ch.lockPermissions !== realCh.lockPermissions) {
        editDiff.lock_permissions = ch.lockPermissions;
      }

      if (ch.parentId !== realCh.parentId) moveDiff.parent_id = ch.parentId;
      if (ch.position !== realCh.position) moveDiff.position = ch.position;

      if (Object.keys(editDiff).length > 1) {
        // > 1 because id is always present
        steps.push({
          toolName: ch.type === 4 ? "edit_category" : "edit_channel",
          params: editDiff,
          symbolsReferenced: [],
          targetId: key,
        });
      }

      if (Object.keys(moveDiff).length > 1) {
        steps.push({
          toolName: ch.type === 4 ? "edit_category" : "move_channel",
          params: moveDiff,
          symbolsReferenced: ch.parentId && isSymbol(ch.parentId) ? [ch.parentId] : [],
          targetId: key,
        });
      }
    }
  }

  return steps;
}

function generateRoleSteps(desired: Record<string, Role>, real: Role[]): RawStep[] {
  const steps: RawStep[] = [];
  const realById = new Map(real.map((r) => [r.id, r]));

  for (const [key, role] of Object.entries(desired)) {
    if (isSymbol(key)) {
      // NEW role
      const params: Record<string, unknown> = {
        name: role.name,
        symbol: key,
      };
      if (role.permissions) params.permissions = role.permissions;
      if (role.color) params.color = role.color;
      if (role.hoist) params.hoist = role.hoist;
      if (role.mentionable) params.mentionable = role.mentionable;
      if (role.position !== 0) params.position = role.position;

      steps.push({
        toolName: "create_role",
        params,
        symbolsReferenced: [],
      });
    } else {
      // EXISTING role
      const realRole = realById.get(key);
      if (!realRole) {
        throw new Error(
          `Role ${key} (${role.name}) exists in DesiredState but was deleted externally`
        );
      }

      const editDiff: Record<string, unknown> = { id: key };
      const moveDiff: Record<string, unknown> = { id: key };

      if (role.name !== realRole.name) editDiff.name = role.name;
      if (role.permissions !== realRole.permissions) editDiff.permissions = role.permissions;
      if (role.color !== realRole.color) editDiff.color = role.color;
      if (role.hoist !== realRole.hoist) editDiff.hoist = role.hoist;
      if (role.mentionable !== realRole.mentionable) editDiff.mentionable = role.mentionable;

      if (role.position !== realRole.position) moveDiff.position = role.position;

      if (Object.keys(editDiff).length > 1) {
        steps.push({
          toolName: "edit_role",
          params: editDiff,
          symbolsReferenced: [],
          targetId: key,
        });
      }

      if (Object.keys(moveDiff).length > 1) {
        steps.push({
          toolName: "move_role",
          params: moveDiff,
          symbolsReferenced: [],
          targetId: key,
        });
      }
    }
  }

  return steps;
}

function generateMemberRoleSteps(
  desired: Record<string, MemberRoleAssignment>,
  real: MemberRoleAssignment[]
): RawStep[] {
  const steps: RawStep[] = [];
  const realByMember = new Map(real.map((m) => [m.memberId, new Set(m.roleIds)]));

  for (const [memberId, assignment] of Object.entries(desired)) {
    const desiredRoles = new Set(assignment.roleIds);
    const realRoles = realByMember.get(memberId) ?? new Set<string>();

    // Roles to add (in desired, not in real)
    for (const roleId of desiredRoles) {
      if (!realRoles.has(roleId)) {
        steps.push({
          toolName: "add_role_to_member",
          params: { member_id: memberId, role_id: roleId },
          symbolsReferenced: isSymbol(roleId) ? [roleId] : [],
        });
      }
    }

    // Roles to remove (in real, not in desired)
    for (const roleId of realRoles) {
      if (!desiredRoles.has(roleId)) {
        steps.push({
          toolName: "remove_role_from_member",
          params: { member_id: memberId, role_id: roleId },
          symbolsReferenced: [],
        });
      }
    }
  }

  return steps;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function generateOverwriteSteps(
  desired: Record<string, PermissionOverwrite>,
  real: PermissionOverwrite[],
  desiredChannels: Record<string, ChannelBase>
): RawStep[] {
  const steps: RawStep[] = [];
  const realByKey = new Map(real.map((o) => [`${o.channelId}:${o.roleId}`, o]));

  // Scan desired overwrites → generate set_overwrite for new/changed
  for (const [key, ow] of Object.entries(desired)) {
    const parts = key.split(":");
    const channelId = parts[0];
    const roleId = parts[1] ?? "";

    // Skip set_overwrite for synced channels — the category handles it
    if (!isSymbol(channelId)) {
      const ch = desiredChannels[channelId];
      if (ch?.lockPermissions === true) continue;
    }

    if (isSymbol(key) || isSymbol(channelId) || isSymbol(roleId)) {
      // NEW overwrite (at least one side is a symbol)
      const params: Record<string, unknown> = {
        channel_id: channelId,
        role_id: roleId,
      };
      if (ow.allow.length > 0) params.allow = ow.allow;
      if (ow.deny.length > 0) params.deny = ow.deny;

      const refs: string[] = [];
      if (isSymbol(channelId)) refs.push(channelId);
      if (isSymbol(roleId)) refs.push(roleId);

      steps.push({
        toolName: "set_overwrite",
        params,
        symbolsReferenced: refs,
      });
    } else {
      // EXISTING overwrite
      const realOw = realByKey.get(key);
      if (!realOw) {
        // Overwrite doesn't exist in real state → create it
        const params: Record<string, unknown> = {
          channel_id: channelId,
          role_id: roleId,
        };
        if (ow.allow.length > 0) params.allow = ow.allow;
        if (ow.deny.length > 0) params.deny = ow.deny;

        steps.push({
          toolName: "set_overwrite",
          params,
          symbolsReferenced: [],
        });
        continue;
      }

      if (!arraysEqual(ow.allow, realOw.allow) || !arraysEqual(ow.deny, realOw.deny)) {
        const params: Record<string, unknown> = {
          channel_id: channelId,
          role_id: roleId,
        };
        if (ow.allow.length > 0) params.allow = ow.allow;
        if (ow.deny.length > 0) params.deny = ow.deny;

        steps.push({
          toolName: "set_overwrite",
          params,
          symbolsReferenced: [],
          targetId: key,
        });
      }
    }
  }

  // Scan real overwrites → generate remove_overwrite for absent ones (symmetric diffing)
  for (const [key, realOw] of realByKey) {
    if (!desired[key]) {
      steps.push({
        toolName: "remove_overwrite",
        params: {
          channel_id: realOw.channelId,
          role_id: realOw.roleId,
        },
        symbolsReferenced: [],
      });
    }
  }

  return steps;
}

function generateTombstoneSteps(tombstones: DesiredState["tombstones"]): RawStep[] {
  const steps: RawStep[] = [];

  for (const t of tombstones) {
    let toolName: string;
    switch (t.resourceType) {
      case "category":
        toolName = "delete_category";
        break;
      case "channel":
        toolName = "delete_channel";
        break;
      case "role":
        toolName = "delete_role";
        break;
      default:
        continue;
    }

    steps.push({
      toolName,
      params: { id: t.discordId },
      symbolsReferenced: [],
      targetId: t.discordId,
    });
  }

  return steps;
}

// ── Phase 2: Topological Sort ────────────────────────────────────────────────

function buildSymbolTable(rawSteps: RawStep[]): SymbolTable {
  const table: SymbolTable = {};

  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const symbol = step.params.symbol as string | undefined;
    if (symbol) {
      let type = "unknown";
      if (step.toolName.includes("channel") || step.toolName.includes("category")) {
        type = "channel";
      } else if (step.toolName.includes("role")) {
        type = "role";
      } else if (step.toolName.includes("overwrite")) {
        type = "overwrite";
      }

      table[symbol] = {
        symbol,
        type,
        definingStepIndex: i,
      };
    }
  }

  return table;
}

function buildDependencies(rawSteps: RawStep[], symbolTable: SymbolTable): number[][] {
  const deps: number[][] = rawSteps.map(() => []);

  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];

    for (const sym of step.symbolsReferenced) {
      const entry = symbolTable[sym];
      if (entry && entry.definingStepIndex !== i) {
        deps[i].push(entry.definingStepIndex);
      }
    }
  }

  return deps;
}

function topologicalSort(rawSteps: RawStep[]): { steps: RawStep[]; indexMap: number[] } {
  const n = rawSteps.length;
  const symbolTable = buildSymbolTable(rawSteps);
  const deps = buildDependencies(rawSteps, symbolTable);

  // Kahn's algorithm with tool-order priority
  const inDegree = new Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (const dep of deps[i]) {
      adj[dep].push(i);
      inDegree[i]++;
    }
  }

  // Priority queue: sort by tool order, then by original index for stability
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
    }
  }

  queue.sort((a, b) => {
    const orderA = TOOL_ORDER[rawSteps[a].toolName] ?? 99;
    const orderB = TOOL_ORDER[rawSteps[b].toolName] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a - b;
  });

  const sorted: number[] = [];
  const indexMap = new Array(n).fill(-1); // oldIndex → newIndex

  while (queue.length > 0) {
    const current = queue.shift()!;
    indexMap[current] = sorted.length;
    sorted.push(current);

    for (const next of adj[current]) {
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
        queue.sort((a, b) => {
          const orderA = TOOL_ORDER[rawSteps[a].toolName] ?? 99;
          const orderB = TOOL_ORDER[rawSteps[b].toolName] ?? 99;
          if (orderA !== orderB) return orderA - orderB;
          return a - b;
        });
      }
    }
  }

  if (sorted.length !== n) {
    throw new Error("Cycle detected in plan dependencies");
  }

  return {
    steps: sorted.map((i) => rawSteps[i]),
    indexMap,
  };
}

// ── Phase 3: Optimize ────────────────────────────────────────────────────────

function mergeEdits(steps: RawStep[]): RawStep[] {
  const merged = new Map<string, RawStep>();
  const result: RawStep[] = [];

  for (const step of steps) {
    if (!step.targetId) {
      result.push(step);
      continue;
    }

    const key = `${step.toolName}:${step.targetId}`;
    const existing = merged.get(key);

    if (existing) {
      // Merge params
      for (const [k, v] of Object.entries(step.params)) {
        if (k !== "id") {
          existing.params[k] = v;
        }
      }
      // Merge symbol refs
      for (const sym of step.symbolsReferenced) {
        if (!existing.symbolsReferenced.includes(sym)) {
          existing.symbolsReferenced.push(sym);
        }
      }
    } else {
      merged.set(key, { ...step });
      result.push(merged.get(key)!);
    }
  }

  return result;
}

function removeNoOps(steps: RawStep[]): RawStep[] {
  return steps.filter((step) => {
    const keys = Object.keys(step.params).filter((k) => k !== "id" && k !== "symbol");
    return keys.length > 0;
  });
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Diff engine: pure function (RealState, DesiredState) → ExecutionSteps.
 *
 * Follows the 3-phase algorithm from the design docs:
 *   Phase 1: Generate raw steps
 *   Phase 2: Topological sort
 *   Phase 3: Optimize (merge edits, remove no-ops)
 *
 * Throws if an existing item in DesiredState is missing from real state
 * (external deletion detected — caller should run validation first).
 */
export function diffEngine(realState: ServerState, desiredState: DesiredState): DiffResult {
  // Phase 1: Generate raw steps
  const rawSteps: RawStep[] = [
    ...generateChannelSteps(desiredState.active.channels, realState.channels),
    ...generateRoleSteps(desiredState.active.roles, realState.roles),
    ...generateMemberRoleSteps(desiredState.active.memberRoles ?? {}, realState.memberRoles ?? []),
    ...generateOverwriteSteps(desiredState.active.overwrites, realState.overwrites, desiredState.active.channels),
    ...generateTombstoneSteps(desiredState.tombstones),
  ];

  // Phase 2: Topological sort
  const { steps: sortedSteps } = topologicalSort(rawSteps);

  // Phase 3: Optimize
  let optimized = mergeEdits(sortedSteps);
  optimized = removeNoOps(optimized);

  // Rebuild symbol table with final indices
  const symbolTable: SymbolTable = {};
  for (let i = 0; i < optimized.length; i++) {
    const step = optimized[i];
    const symbol = step.params.symbol as string | undefined;
    if (symbol) {
      let type = "unknown";
      if (step.toolName.includes("channel") || step.toolName.includes("category")) {
        type = "channel";
      } else if (step.toolName.includes("role")) {
        type = "role";
      }

      symbolTable[symbol] = {
        symbol,
        type,
        definingStepIndex: i,
      };
    }
  }

  // Map dependencies to final indices
  const steps: PlanStep[] = optimized.map((step, i) => ({
    index: i,
    toolName: step.toolName,
    params: step.params,
    status: "pending",
    resolvedParams: undefined,
    result: undefined,
    error: undefined,
    // Compute dependsOn based on symbol references
    dependsOn: step.symbolsReferenced
      .map((sym) => {
        const entry = symbolTable[sym];
        return entry ? entry.definingStepIndex : -1;
      })
      .filter((idx) => idx !== -1 && idx !== i),
  }));

  return { steps, symbolTable };
}
