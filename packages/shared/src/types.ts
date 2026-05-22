export interface ChannelBase {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

export interface TextChannel extends ChannelBase {
  topic: string | null;
  messageCount?: number;
}

export interface VoiceChannel extends ChannelBase {
  bitrate: number;
  userLimit: number;
}

export interface CategoryNode extends ChannelBase {
  children: ChannelBase[];
}

export interface Role {
  id: string;
  name: string;
  position: number;
  permissions: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  memberCount?: number;
}

export interface PermissionOverwrite {
  channelId: string;
  roleId: string;
  allow: string;
  deny: string;
}

export interface ServerState {
  guildId: string;
  guildName: string;
  memberCount: number;
  channels: ChannelBase[];
  roles: Role[];
  overwrites: PermissionOverwrite[];
}

export type PlanStatus =
  | "draft"
  | "validated"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rolled_back";

export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

export interface PlanStep {
  index: number;
  toolName: string;
  params: Record<string, unknown>;
  status: StepStatus;
  resolvedParams?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export interface Plan {
  id: string;
  guildId: string;
  userId: string;
  status: PlanStatus;
  userPrompt: string;
  serverType: string | null;
  planData: Record<string, unknown>;
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
  completedAt: string | null;
  error: Record<string, unknown> | null;
}

export interface SymbolEntry {
  symbol: string;
  type: string;
  definingStepIndex: number;
  resolvedDiscordId?: string;
}

export type SymbolTable = Record<string, SymbolEntry>;

export type AssumptionStatus = "pending" | "pass" | "fail";

export interface Assumption {
  type: string;
  value: string;
  resourceType: string;
  checked: boolean;
  status: AssumptionStatus;
}

export type IterationType = "llm_generated" | "manual_edit" | "revert";

export interface Iteration {
  version: number;
  type: IterationType;
  desiredState: ServerState;
  timestamp: string;
}

export type SnapshotType =
  | "execution_before"
  | "execution_after"
  | "role_deletion"
  | "plan_state";

export interface Snapshot {
  id: string;
  type: SnapshotType;
  guildId: string;
  planId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  expiresAt: string | null;
  metadata: Record<string, unknown> | null;
}
