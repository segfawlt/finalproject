import type { PlanStep, SymbolTable, DesiredState, ChannelBase, PermissionOverwrite } from "@repo/shared";
import { DISCORD_PERMISSIONS } from "@repo/shared";
import { botHasAdministrator, getBotHighestRolePosition } from "../bot/permissions";
import { guildCache } from "../bot/cache";

// ── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "block" | "warning";

export interface ValidationIssue {
  group: string;
  message: string;
  severity: ValidationSeverity;
  stepIndex?: number;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
}

// ── Group A: Permission Checks ───────────────────────────────────────────────

function validatePermissions(steps: PlanStep[], guildId: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!botHasAdministrator(guildId)) {
    issues.push({
      group: "A. Permission",
      message: "Bot does not have ADMINISTRATOR permission in this guild. Execution is blocked.",
      severity: "block",
    });
  }

  // Bot role hierarchy check: bot must be at the highest position
  const botPosition = getBotHighestRolePosition(guildId);
  if (botPosition >= 0) {
    const cache = guildCache.get(guildId);
    let maxTargetPosition = -1;

    for (const step of steps) {
      if (
        step.toolName === "edit_role" ||
        step.toolName === "delete_role" ||
        step.toolName === "move_role"
      ) {
        const id = step.params.id as string | undefined;
        if (id && !id.startsWith("$") && cache) {
          const role = cache.roles.get(id);
          if (role && role.position > maxTargetPosition) {
            maxTargetPosition = role.position;
          }
        }
      }

      // Member role assignment: bot cannot assign roles above its own position
      if (step.toolName === "add_role_to_member" || step.toolName === "remove_role_from_member") {
        const roleId = step.params.role_id as string | undefined;
        if (roleId && !roleId.startsWith("$") && cache) {
          const role = cache.roles.get(roleId);
          if (role && role.position > botPosition) {
            issues.push({
              group: "A. Permission",
              message: `Bot cannot assign or remove role ${roleId} (position ${role.position}) because it is above the bot's highest role (position ${botPosition}).`,
              severity: "block",
              stepIndex: steps.indexOf(step),
            });
          }
        }
      }
    }

    if (maxTargetPosition > botPosition) {
      issues.push({
        group: "A. Permission",
        message: `Bot cannot execute this plan. Its highest role (position ${botPosition}) is below a role this plan modifies (position ${maxTargetPosition}). Move the bot's role to the top of the role list and try again.`,
        severity: "block",
      });
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check that permission names in set_overwrite are valid
    if (step.toolName === "set_overwrite") {
      const allow = step.params.allow as string[] | undefined;
      const deny = step.params.deny as string[] | undefined;
      const allPerms = [...(allow ?? []), ...(deny ?? [])];

      for (const perm of allPerms) {
        if (typeof perm !== "string" || perm.length === 0) {
          issues.push({
            group: "A. Permission",
            message: `Invalid permission name "${perm}" in step ${i}`,
            severity: "block",
            stepIndex: i,
          });
          continue;
        }
        if (!DISCORD_PERMISSIONS[perm as keyof typeof DISCORD_PERMISSIONS]) {
          issues.push({
            group: "A. Permission",
            message: `Unknown permission name "${perm}" in step ${i}`,
            severity: "block",
            stepIndex: i,
          });
        }
      }
    }
  }

  return issues;
}

// ── Group B: Dependency Checks ─────────────────────────────────────────────

function validateDependencies(steps: PlanStep[], symbolTable: SymbolTable): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check all symbols referenced in params are defined
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    for (const [key, value] of Object.entries(step.params)) {
      if (typeof value === "string" && value.startsWith("$")) {
        if (!symbolTable[value]) {
          issues.push({
            group: "B. Dependency",
            message: `Undefined symbol "${value}" referenced in param "${key}" of step ${i}`,
            severity: "block",
            stepIndex: i,
          });
        }
      }
    }
  }

  // Check dependsOn references are valid and don't form cycles
  const n = steps.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  const inDegree = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const deps = steps[i].dependsOn ?? [];
    for (const dep of deps) {
      if (dep < 0 || dep >= n) {
        issues.push({
          group: "B. Dependency",
          message: `Dangling dependency ${dep} in step ${i}`,
          severity: "block",
          stepIndex: i,
        });
        continue;
      }
      adj[dep].push(i);
      inDegree[i]++;
    }
  }

  // Kahn's algorithm to detect cycles
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  let visited = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visited++;
    for (const next of adj[cur]) {
      inDegree[next]--;
      if (inDegree[next] === 0) queue.push(next);
    }
  }

  if (visited !== n) {
    issues.push({
      group: "B. Dependency",
      message: "Circular dependency detected in plan steps",
      severity: "block",
    });
  }

  return issues;
}

// ── Group C: Resource Constraints ────────────────────────────────────────────

function validateResourceConstraints(
  steps: PlanStep[],
  desiredState: DesiredState
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for duplicate names in creations
  const names = new Map<string, string[]>(); // name → step indices
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.toolName.startsWith("create_")) {
      const name = step.params.name as string | undefined;
      if (name) {
        const existing = names.get(name) ?? [];
        existing.push(String(i));
        names.set(name, existing);
      }
    }
  }

  for (const [name, indices] of names) {
    if (indices.length > 1) {
      issues.push({
        group: "C. Resource",
        message: `Duplicate name "${name}" in creation steps ${indices.join(", ")}`,
        severity: "block",
      });
    }
  }

  // Check for duplicate member role operations
  const memberRoleOps = new Map<string, string[]>(); // "memberId:roleId" → step indices
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (
      step.toolName === "add_role_to_member" ||
      step.toolName === "remove_role_from_member"
    ) {
      const memberId = step.params.member_id as string;
      const roleId = step.params.role_id as string;
      const key = `${memberId}:${roleId}`;
      const existing = memberRoleOps.get(key) ?? [];
      existing.push(String(i));
      memberRoleOps.set(key, existing);
    }
  }

  for (const [key, indices] of memberRoleOps) {
    if (indices.length > 1) {
      issues.push({
        group: "C. Resource",
        message: `duplicate member role operation for ${key} in steps ${indices.join(", ")}`,
        severity: "block",
      });
    }
  }

  // Check category child count won't exceed 50
  const categoryChildren = new Map<string, number>();
  for (const [, ch] of Object.entries(desiredState.active.channels)) {
    if (ch.parentId) {
      categoryChildren.set(ch.parentId, (categoryChildren.get(ch.parentId) ?? 0) + 1);
    }
  }

  for (const [catId, count] of categoryChildren) {
    if (count > 50) {
      issues.push({
        group: "C. Resource",
        message: `Category ${catId} would have ${count} children (max 50)`,
        severity: "block",
      });
    }
  }

  // Check channel type constraints
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.toolName === "edit_channel" || step.toolName === "create_channel") {
      const topic = step.params.topic as string | undefined;
      const type = step.params.type as number | undefined;
      if (topic != null && type !== 0 && type !== 5) {
        issues.push({
          group: "C. Resource",
          message: `Topic can only be set on text/announcement channels (step ${i})`,
          severity: "block",
          stepIndex: i,
        });
      }
    }
  }

  return issues;
}

// ── Group D: Safety Guards ───────────────────────────────────────────────────

function validateSafetyGuards(steps: PlanStep[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Don't grant ADMINISTRATOR to newly created roles
    if (step.toolName === "create_role") {
      const perms = step.params.permissions as string[] | undefined;
      if (perms?.includes("ADMINISTRATOR")) {
        issues.push({
          group: "D. Safety",
          message: `Plan would create a role with ADMINISTRATOR (step ${i}). This is blocked unless explicitly requested.`,
          severity: "block",
          stepIndex: i,
        });
      }
    }

    // Don't remove bot's own permissions (via overwrite)
    if (step.toolName === "set_overwrite" || step.toolName === "remove_overwrite") {
      // TODO: when we have bot user ID, check if the overwrite targets the bot's role
    }
  }

  // Rate limit estimate (>5 minutes = warn)
  const estimatedMs = steps.length * 500; // Rough estimate: 500ms per step
  if (estimatedMs > 5 * 60 * 1000) {
    issues.push({
      group: "D. Safety",
      message: `Plan may take >5 minutes to execute (~${Math.ceil(estimatedMs / 1000)}s estimated)`,
      severity: "warning",
    });
  }

  return issues;
}

// ── Group D helpers: overwrite consolidation ────────────────────────────────

interface OverwriteEntry {
  roleId: string;
  allow: string[];
  deny: string[];
}

function getOverwritesFor(
  channelId: string,
  overwrites: Record<string, PermissionOverwrite>
): OverwriteEntry[] {
  const entries: OverwriteEntry[] = [];
  const prefix = `${channelId}:`;
  for (const [key, ow] of Object.entries(overwrites)) {
    if (key.startsWith(prefix)) {
      entries.push({ roleId: ow.roleId, allow: ow.allow, deny: ow.deny });
    }
  }
  return entries;
}

function arraysEqualSorted(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

function overwritesEqual(a: OverwriteEntry[], b: OverwriteEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const match = b.find(
      (entry) =>
        entry.roleId === a[i].roleId &&
        arraysEqualSorted(entry.allow, a[i].allow) &&
        arraysEqualSorted(entry.deny, a[i].deny)
    );
    if (!match) return false;
  }
  return true;
}

function validateOverwriteConsolidation(
  _steps: PlanStep[],
  desiredState: DesiredState
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const channels = Object.values(desiredState.active.channels);

  const byCategory = new Map<string, ChannelBase[]>();
  for (const ch of channels) {
    if (!ch.parentId) continue;
    const list = byCategory.get(ch.parentId) ?? [];
    list.push(ch);
    byCategory.set(ch.parentId, list);
  }

  for (const [, children] of byCategory) {
    if (children.length < 2) continue;

    for (let i = 0; i < children.length; i++) {
      const a = children[i];
      if (a.lockPermissions !== false) continue;
      const aOverwrites = getOverwritesFor(a.id, desiredState.active.overwrites);

      for (let j = i + 1; j < children.length; j++) {
        const b = children[j];
        if (b.lockPermissions !== false) continue;
        const bOverwrites = getOverwritesFor(b.id, desiredState.active.overwrites);

        if (overwritesEqual(aOverwrites, bOverwrites) && aOverwrites.length > 0) {
          issues.push({
            group: "D. Safety",
            message: `Channels ${a.name} and ${b.name} have identical permissions but are not synced to their category`,
            severity: "warning",
          });
          break;
        }
      }
    }
  }

  return issues;
}

// ── Group E: Plan Integrity ──────────────────────────────────────────────────

function validatePlanIntegrity(steps: PlanStep[], status: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (steps.length === 0) {
    issues.push({
      group: "E. Integrity",
      message: "Plan has no steps",
      severity: "block",
    });
  }

  if (status !== "draft" && status !== "validated") {
    issues.push({
      group: "E. Integrity",
      message: `Plan status is "${status}" — must be draft or validated to execute`,
      severity: "block",
    });
  }

  return issues;
}

// ── Main Entry Point ─────────────────────────────────────────────────────────

export interface ValidatePlanOptions {
  steps: PlanStep[];
  symbolTable: SymbolTable;
  desiredState: DesiredState;
  guildId: string;
  status: string;
}

/**
 * Deterministic validation pipeline.
 *
 * Five groups of hard-coded checks (fast, no LLM).
 *
 * Returns passed=true only if there are zero block-level issues.
 */
export async function validatePlan(options: ValidatePlanOptions): Promise<ValidationResult> {
  const { steps, symbolTable, desiredState, guildId, status } = options;

  const issues: ValidationIssue[] = [
    ...validatePermissions(steps, guildId),
    ...validateDependencies(steps, symbolTable),
    ...validateResourceConstraints(steps, desiredState),
    ...validateSafetyGuards(steps),
    ...validateOverwriteConsolidation(steps, desiredState),
    ...validatePlanIntegrity(steps, status),
  ];

  const hasBlockers = issues.some((i) => i.severity === "block");

  return {
    passed: !hasBlockers,
    issues,
  };
}
