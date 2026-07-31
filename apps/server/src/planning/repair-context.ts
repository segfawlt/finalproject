import type { DesiredState, ServerState } from "@repo/shared";

export interface RepairConflict {
  kind: "missing_resource" | "failed_assumption" | "server_state_changed";
  resourceType?: "channel" | "category" | "role" | "member";
  resourceId?: string;
  resourceName?: string;
  message: string;
}

interface RepairPromptOptions {
  currentState: ServerState;
  previousDesiredState: DesiredState;
  conflicts: RepairConflict[];
}

export function buildRepairPrompt({
  currentState,
  previousDesiredState,
  conflicts,
}: RepairPromptOptions): string {
  return [
    "The approved plan is stale and needs repair.",
    "Fresh Discord state is authoritative. Re-plan from that state using the planning tools.",
    "Preserve external changes unless the original user intent clearly requires changing them.",
    "Do not assume a resource with the same name replaces a deleted resource.",
    "Use ask_user when repairing a missing or changed resource requires a product decision.",
    "Do not execute Discord changes. Produce a new reviewable desired state only.",
    "",
    `Fresh server state:\n${JSON.stringify(currentState)}`,
    `Previous desired state:\n${JSON.stringify(previousDesiredState)}`,
    `Detected conflicts:\n${JSON.stringify(conflicts)}`,
  ].join("\n");
}
