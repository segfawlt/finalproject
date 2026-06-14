import type { Assumption, ServerState } from "../types";

export interface AssumptionResult {
  passed: boolean;
  message: string;
}

/**
 * Evaluate an array of Assumption objects against a fresh ServerState.
 *
 * Returns one AssumptionResult per assumption. If any result has `passed: false`,
 * execution should be blocked (block-only policy).
 */
export function evaluateAssumptions(
  assumptions: Assumption[],
  state: ServerState
): AssumptionResult[] {
  return assumptions.map((a) => evaluateOne(a, state));
}

function evaluateOne(assumption: Assumption, state: ServerState): AssumptionResult {
  const { type, value, resourceType, excludeId } = assumption;

  switch (type) {
    case "exists": {
      if (resourceType === "channel") {
        const found = state.channels.find((ch) => ch.id === value);
        return found
          ? { passed: true, message: `Channel ${value} exists` }
          : { passed: false, message: `Channel ${value} no longer exists` };
      }
      if (resourceType === "role") {
        const found = state.roles.find((r) => r.id === value);
        return found
          ? { passed: true, message: `Role ${value} exists` }
          : { passed: false, message: `Role ${value} no longer exists` };
      }
      if (resourceType === "category") {
        const found = state.channels.find((ch) => ch.id === value && ch.type === 4);
        return found
          ? { passed: true, message: `Category ${value} exists` }
          : { passed: false, message: `Category ${value} no longer exists` };
      }
      return { passed: true, message: `Unknown resource type ${resourceType} for exists check` };
    }

    case "unique_name": {
      if (resourceType === "channel") {
        const dup = state.channels.find((ch) => ch.name === value && ch.id !== excludeId);
        return dup
          ? { passed: false, message: `Channel name "${value}" already in use` }
          : { passed: true, message: `Channel name "${value}" is unique` };
      }
      if (resourceType === "role") {
        const dup = state.roles.find((r) => r.name === value && r.id !== excludeId);
        return dup
          ? { passed: false, message: `Role name "${value}" already in use` }
          : { passed: true, message: `Role name "${value}" is unique` };
      }
      if (resourceType === "category") {
        const dup = state.channels.find((ch) => ch.name === value && ch.id !== excludeId);
        return dup
          ? { passed: false, message: `Category name "${value}" already in use` }
          : { passed: true, message: `Category name "${value}" is unique` };
      }
      return {
        passed: true,
        message: `Unknown resource type ${resourceType} for unique_name check`,
      };
    }

    case "no_children": {
      const children = state.channels.filter((ch) => ch.parentId === value);
      return children.length > 0
        ? { passed: false, message: `Category ${value} still has ${children.length} children` }
        : { passed: true, message: `Category ${value} has no children` };
    }

    case "not_system_channel": {
      // Phase 1: skip — ServerState does not track system channel ID
      return { passed: true, message: "System channel check skipped (Phase 1)" };
    }

    case "not_everyone": {
      // @everyone role ID equals guild ID
      return value === state.guildId
        ? { passed: false, message: "Cannot modify the @everyone role" }
        : { passed: true, message: "Target is not the @everyone role" };
    }

    case "position_valid": {
      if (resourceType === "role") {
        const pos = Number(value);
        const max = state.roles.length;
        return pos >= 0 && pos <= max
          ? { passed: true, message: `Role position ${pos} is valid` }
          : { passed: false, message: `Role position ${pos} is out of range (0-${max})` };
      }
      return { passed: true, message: `Position check for ${resourceType} skipped` };
    }

    case "bot_position": {
      // Phase 1: skip — ServerState does not track bot role position
      return { passed: true, message: "Bot position check skipped (Phase 1)" };
    }

    case "warn_everyone_view": {
      // value is the role_id being targeted. Block when it is the @everyone role,
      // identified either by the literal string Discord.js exposes or by the
      // guild ID (which is the @everyone role's actual ID in Discord).
      const isEveryone = value === "@everyone" || value === state.guildId;
      return isEveryone
        ? { passed: false, message: `Denying VIEW_CHANNEL to @everyone on channel` }
        : { passed: true, message: "Not denying VIEW_CHANNEL to @everyone" };
    }

    case "member_exists": {
      const found = state.memberRoles?.find((mr) => mr.memberId === value);
      return found
        ? { passed: true, message: `Member ${value} exists in guild` }
        : { passed: false, message: `Member ${value} no longer in guild` };
    }

    case "role_assigned": {
      const found = state.roles.find((r) => r.id === value);
      return found
        ? { passed: true, message: `Role ${value} exists` }
        : { passed: false, message: `Role ${value} no longer exists` };
    }

    default:
      return { passed: true, message: `Unknown assumption type "${type}" — skipped` };
  }
}
