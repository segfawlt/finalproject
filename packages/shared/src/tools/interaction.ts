import { z } from "zod";
import type { PlanResult } from "../types";
import { DesiredStateStore } from "../state";

export const askUserSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ label: z.string() })).optional(),
  multiSelect: z.boolean().optional(),
  allowCustom: z.boolean().optional(),
});

export type AskUserParams = z.infer<typeof askUserSchema>;

export interface AskUserResult {
  answer: string;
}

// ── plan() function ────────────────────────────────────────────────────────

export function planAskUser(_params: AskUserParams, _store: DesiredStateStore): PlanResult {
  // ask_user is an ImmediateTool — it does not modify DesiredState.
  // The planning loop handles it separately (pauses, gets user input).
  return { planned: true };
}

// ask_user is planning-only — there is no execute() function.
// The planning loop handles user interaction directly and injects
// the answer into the step's resolvedParams.
