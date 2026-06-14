export interface ForumTag {
  name: string;
  moderated?: boolean;
  emojiId?: string | null;
  emojiName?: string | null;
}

export interface DefaultReactionEmoji {
  emojiId?: string | null;
  emojiName?: string | null;
}

export interface ChannelBase {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  messageCount?: number;
  topic?: string | null;
  bitrate?: number;
  userLimit?: number;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  availableTags?: ForumTag[];
  defaultReactionEmoji?: DefaultReactionEmoji | null;
  defaultSortOrder?: number | null;
  defaultForumLayout?: number;
  defaultThreadRateLimitPerUser?: number;
  flags?: number;
  lockPermissions?: boolean;
}

export interface TextChannel extends ChannelBase {
  topic: string | null;
}

export interface VoiceChannel extends ChannelBase {
  bitrate: number;
  userLimit: number;
}

export interface RoleTags {
  botId?: string;
  botName?: string;
  integrationId?: string;
  premiumSubscriber?: null;
  subscriptionListingId?: string;
  availableForPurchase?: null;
  guildConnections?: null;
}

export interface Role {
  id: string;
  name: string;
  position: number;
  permissions: string[];
  color: number;
  hoist: boolean;
  mentionable: boolean;
  memberCount?: number;
  tags?: RoleTags;
}

export interface PermissionOverwrite {
  channelId: string;
  roleId: string;
  allow: string[];
  deny: string[];
}

export interface MemberRoleAssignment {
  memberId: string;
  roleIds: string[];
}

export interface ServerState {
  guildId: string;
  guildName: string;
  memberCount: number;
  channels: ChannelBase[];
  roles: Role[];
  overwrites: PermissionOverwrite[];
  memberRoles?: MemberRoleAssignment[];
}

export type PlanStatus =
  | "draft"
  | "validated"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "rolled_back";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface PlanStep {
  index: number;
  toolName: string;
  params: Record<string, unknown>;
  status: StepStatus;
  resolvedParams?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  dependsOn?: number[];
}

export interface PlanLlmResponse {
  summary: string;
  reasoning: string;
}

export interface PlanResult {
  planned: boolean;
  symbol?: string;
  blocked?: boolean;
  reason?: string;
  children?: Array<{ id: string; name: string }>;
}

export interface PlanResults {
  created: string[];
  modified: string[];
  deleted: string[];
}

export interface PlanSnapshots {
  before?: string; // snapshot ID
  after?: string; // snapshot ID
}

export interface PlanData {
  llmResponse?: PlanLlmResponse;
  desiredState?: DesiredState;
  executionSteps?: PlanStep[];
  symbolTable?: SymbolTable;
  assumptions?: Assumption[];
  snapshots?: PlanSnapshots;
  results?: PlanResults;
}

export interface Plan {
  id: string;
  guildId: string;
  userId: string;
  conversationId: string | null;
  status: PlanStatus;
  userPrompt: string;
  serverType: string | null;
  planData: PlanData;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
  completedAt: string | null;
  error: Record<string, unknown> | null;
}

// ── Planning State ────────────────────────────────────────────────────────────

export interface Tombstone {
  discordId: string;
  resourceType: "channel" | "role" | "category";
  name: string;
  deletedInVersion: number;
}

export interface DesiredStateActive {
  channels: Record<string, ChannelBase>;
  roles: Record<string, Role>;
  overwrites: Record<string, PermissionOverwrite>;
  memberRoles?: Record<string, MemberRoleAssignment>;
}

export interface DesiredState {
  guildId: string;
  guildName: string;
  active: DesiredStateActive;
  tombstones: Tombstone[];
  symbolCounter: number;
  version: number;
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
  excludeId?: string;
}

export type IterationType = "llm_generated" | "manual_edit" | "revert";

export interface Iteration {
  version: number;
  type: IterationType;
  desiredState: DesiredState;
  timestamp: string;
}

export type SnapshotType = "execution_before" | "execution_after" | "role_deletion" | "plan_state";

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

// ── API Response Types ─────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiError {
  success: false;
  error: string;
  statusCode: number;
  details?: unknown;
}
