import type { ExecuteContext } from "@repo/shared";
import type { PlanStep, SymbolTable, ServerState } from "@repo/shared";
import {
  getTool,
  executeCategoryCreate,
  executeCategoryEdit,
  executeCategoryDelete,
  executeChannelCreate,
  executeChannelEdit,
  executeChannelDelete,
  executeChannelMove,
  executeRoleCreate,
  executeRoleEdit,
  executeRoleDelete,
  executeRoleMove,
  executeOverwriteSet,
  executeOverwriteRemove,
  executeMemberRoleAdd,
  executeMemberRoleRemove,
  fork,
} from "@repo/shared";
import { diffEngine } from "./diff-engine";
import { botClient } from "../bot/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionEvent {
  type:
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "step_retry"
    | "plan_completed"
    | "plan_failed"
    | "rollback_started"
    | "rollback_completed";
  stepIndex?: number;
  planId?: string;
  error?: string;
  result?: Record<string, unknown>;
}

export type EventEmitter = (event: ExecutionEvent) => void | Promise<void>;

export interface ExecutionOptions {
  planId: string;
  steps: PlanStep[];
  symbolTable: SymbolTable;
  ctx: ExecuteContext;
  emit: EventEmitter;
  abortSignal?: AbortSignal;
  beforeSnapshot?: ServerState;
}

export interface ExecutionResult {
  success: boolean;
  completedSteps: PlanStep[];
  failedStep?: PlanStep;
  error?: string;
}

// ── Symbol Resolution ────────────────────────────────────────────────────────

function resolveSymbols(
  params: Record<string, unknown>,
  symbolTable: SymbolTable
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.startsWith("$") && symbolTable[value]) {
      const entry = symbolTable[value];
      if (entry.resolvedDiscordId) {
        resolved[key] = entry.resolvedDiscordId;
      } else {
        // Symbol hasn't been resolved yet — this should not happen if
        // topological sort is correct
        throw new Error(
          `Symbol ${value} referenced before it was resolved (step depends on undefined symbol)`
        );
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ── Tool Dispatch ────────────────────────────────────────────────────────────

async function dispatchStep(step: PlanStep, ctx: ExecuteContext): Promise<Record<string, unknown>> {
  const { toolName, resolvedParams } = step;

  const tool = getTool(toolName);
  if (tool.executionMode === "planning_only") {
    throw new Error(
      `Tool "${toolName}" is a planning-only tool and cannot be executed. ` +
        "If this reached execution, the diff engine produced an invalid plan."
    );
  }

  if (!resolvedParams) {
    throw new Error(`Step ${step.index} has no resolvedParams`);
  }

  switch (toolName) {
    case "create_category": {
      const result = await executeCategoryCreate(
        resolvedParams as Parameters<typeof executeCategoryCreate>[0],
        ctx
      );
      return { id: result.id };
    }
    case "edit_category":
      await executeCategoryEdit(resolvedParams as Parameters<typeof executeCategoryEdit>[0], ctx);
      return {};
    case "delete_category":
      await executeCategoryDelete(
        resolvedParams as Parameters<typeof executeCategoryDelete>[0],
        ctx
      );
      return {};
    case "create_channel": {
      const result = await executeChannelCreate(
        resolvedParams as Parameters<typeof executeChannelCreate>[0],
        ctx
      );
      return { id: result.id };
    }
    case "edit_channel":
      await executeChannelEdit(resolvedParams as Parameters<typeof executeChannelEdit>[0], ctx);
      return {};
    case "delete_channel":
      await executeChannelDelete(resolvedParams as Parameters<typeof executeChannelDelete>[0], ctx);
      return {};
    case "move_channel":
      await executeChannelMove(resolvedParams as Parameters<typeof executeChannelMove>[0], ctx);
      return {};
    case "create_role": {
      const result = await executeRoleCreate(
        resolvedParams as Parameters<typeof executeRoleCreate>[0],
        ctx
      );
      return { id: result.id };
    }
    case "edit_role":
      await executeRoleEdit(resolvedParams as Parameters<typeof executeRoleEdit>[0], ctx);
      return {};
    case "delete_role":
      await executeRoleDelete(resolvedParams as Parameters<typeof executeRoleDelete>[0], ctx);
      return {};
    case "move_role":
      await executeRoleMove(resolvedParams as Parameters<typeof executeRoleMove>[0], ctx);
      return {};
    case "set_overwrite":
      await executeOverwriteSet(resolvedParams as Parameters<typeof executeOverwriteSet>[0], ctx);
      return {};
    case "remove_overwrite":
      await executeOverwriteRemove(
        resolvedParams as Parameters<typeof executeOverwriteRemove>[0],
        ctx
      );
      return {};
    case "add_role_to_member":
      await executeMemberRoleAdd(resolvedParams as Parameters<typeof executeMemberRoleAdd>[0], ctx);
      return {};
    case "remove_role_from_member":
      await executeMemberRoleRemove(
        resolvedParams as Parameters<typeof executeMemberRoleRemove>[0],
        ctx
      );
      return {};
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── Error Classification ─────────────────────────────────────────────────────

function isTransientError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: number }).code;
    // Discord HTTP status codes that are transient
    return code === 500 || code === 502 || code === 503 || code === 504;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("timeout") || msg.includes("etimedout") || msg.includes("econnreset");
  }
  return false;
}

function isKnownError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: number }).code;
    return code === 403 || code === 404;
  }
  return false;
}

// ── Error Diagnosis ─────────────────────────────────────────────────────────

const ERROR_DIAGNOSIS: Record<number, string> = {
  403: "The bot lacks permission for this action. Check that the bot has ADMINISTRATOR in the server.",
  404: "The target channel or role no longer exists. It may have been deleted externally.",
  429: "Rate limited by Discord. The system will retry automatically.",
  400: "Invalid request parameters. This is likely a bug in the plan — please re-plan.",
  401: "Bot token is invalid or expired. Contact the administrator.",
};

function diagnoseError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code: number }).code;
    return ERROR_DIAGNOSIS[code] ?? "An unexpected error occurred. Please try again or re-plan.";
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("missing permissions") || msg.includes("permission")) {
      return "The bot lacks permission for this action.";
    }
    if (msg.includes("unknown")) {
      return "The target resource does not exist.";
    }
  }
  return "An unexpected error occurred. Please try again or re-plan.";
}

// ── Retry Logic ──────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number): number {
  const base = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
  const jitter = base * 0.25 * (Math.random() * 2 - 1); // ±25%
  return Math.max(100, base + jitter);
}

const MAX_RETRIES = 3;

// ── Rollback ─────────────────────────────────────────────────────────────────

export async function buildCurrentStateFromDiscord(guildId: string): Promise<ServerState> {
  const guild = botClient.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild ${guildId} not found during state capture`);
  }

  // Fetch fresh data directly from Discord — do NOT use stale guild cache
  const channels = await guild.channels.fetch();
  const roles = await guild.roles.fetch();

  const channelEntries: ServerState["channels"] = [];
  const overwriteEntries: ServerState["overwrites"] = [];

  for (const [, channel] of channels) {
    if (!channel) continue;
    channelEntries.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
      position: channel.position,
    });

    if ("permissionOverwrites" in channel) {
      const overwrites = channel.permissionOverwrites.cache;
      for (const [, ow] of overwrites) {
        overwriteEntries.push({
          channelId: channel.id,
          roleId: ow.id,
          allow: Array.from(ow.allow.toArray()),
          deny: Array.from(ow.deny.toArray()),
        });
      }
    }
  }

  const roleEntries: ServerState["roles"] = [];
  for (const [, role] of roles) {
    roleEntries.push({
      id: role.id,
      name: role.name,
      position: role.position,
      permissions: Array.from(role.permissions.toArray()),
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
    });
  }

  return {
    guildId,
    guildName: guild.name,
    memberCount: guild.memberCount ?? 0,
    channels: channelEntries,
    roles: roleEntries,
    overwrites: overwriteEntries,
  };
}

/**
 * Full rollback using diff engine: computes reverse diff from current state
 * to before-snapshot, then executes it. Handles all change types uniformly.
 */
export async function rollbackFull(
  beforeSnapshot: ServerState,
  planId: string,
  ctx: ExecuteContext,
  emit: EventEmitter
): Promise<ExecutionResult> {
  await emit({ type: "rollback_started", planId });

  const currentState = await buildCurrentStateFromDiscord(ctx.guildId);
  const desiredBefore = fork(beforeSnapshot);
  const diffResult = diffEngine(currentState, desiredBefore);

  if (diffResult.steps.length === 0) {
    await emit({ type: "rollback_completed", planId });
    return { success: true, completedSteps: [] };
  }

  const result = await executePlan({
    planId,
    steps: diffResult.steps,
    symbolTable: diffResult.symbolTable,
    ctx,
    emit,
  });

  await emit({ type: "rollback_completed", planId });
  return result;
}

// ── Main Execution Loop ──────────────────────────────────────────────────────

/**
 * Execute a plan against Discord.
 *
 * Steps are executed in order. Symbols are resolved before each step.
 * Transient errors trigger up to 3 retries with exponential backoff.
 * Permanent failures trigger rollback of all completed steps.
 *
 * Progress is emitted via the `emit` callback for SSE streaming.
 */
export async function executePlan(options: ExecutionOptions): Promise<ExecutionResult> {
  const { planId, steps, symbolTable, ctx, emit, abortSignal, beforeSnapshot } = options;
  const completedSteps: PlanStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check abort signal
    if (abortSignal?.aborted) {
      if (beforeSnapshot) {
        const rollbackResult = await rollbackFull(beforeSnapshot, planId, ctx, emit);
        if (!rollbackResult.success) {
          await emit({ type: "plan_failed", planId, error: "Rollback after abort failed" });
          return { success: false, completedSteps, error: "Rollback after abort failed" };
        }
      }
      await emit({ type: "plan_failed", planId, error: "Execution aborted by user" });
      return { success: false, completedSteps, error: "Execution aborted by user" };
    }

    // Skip steps whose dependencies failed or were themselves skipped
    const depsFailed = step.dependsOn?.some(
      (depIdx) => steps[depIdx].status === "failed" || steps[depIdx].status === "skipped"
    );
    if (depsFailed) {
      step.status = "skipped";
      continue;
    }

    // Resolve symbols
    step.resolvedParams = resolveSymbols(step.params, symbolTable);

    await emit({ type: "step_started", stepIndex: i, planId });

    let lastError: Error | undefined;
    let success = false;

    // Retry loop
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await dispatchStep(step, ctx);
        step.result = result;
        step.status = "completed";
        success = true;

        // Update symbol table for created items
        const symbol = step.params.symbol as string | undefined;
        if (symbol && symbolTable[symbol]) {
          const createdId = result?.id as string | undefined;
          if (createdId) {
            symbolTable[symbol].resolvedDiscordId = createdId;
          }
        }

        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (isTransientError(err) && attempt < MAX_RETRIES) {
          const backoff = computeBackoff(attempt);
          await emit({
            type: "step_retry",
            stepIndex: i,
            planId,
            error: lastError.message,
          });
          await delay(backoff);
          continue;
        }

        if (isKnownError(err)) {
          // Known error — don't retry, but don't trigger rollback yet.
          // In Phase 1, we just fail. Future: hardcoded fix map + LLM diagnosis.
          break;
        }

        // Unknown error — don't retry
        break;
      }
    }

    if (success) {
      completedSteps.push(step);
      await emit({ type: "step_completed", stepIndex: i, planId, result: step.result });
    } else {
      step.status = "failed";
      step.error = lastError?.message;

      const diagnosis = diagnoseError(lastError);

      await emit({
        type: "step_failed",
        stepIndex: i,
        planId,
        error: lastError?.message,
        result: { diagnosis },
      });

      // Rollback all completed steps using full diff-based rollback
      if (beforeSnapshot) {
        await rollbackFull(beforeSnapshot, planId, ctx, emit);
      }

      await emit({ type: "plan_failed", planId, error: lastError?.message });

      return {
        success: false,
        completedSteps,
        failedStep: step,
        error: lastError?.message,
      };
    }
  }

  await emit({ type: "plan_completed", planId });

  return {
    success: true,
    completedSteps,
  };
}
