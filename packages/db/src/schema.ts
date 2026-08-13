import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Users (managed by Better Auth with custom fields) ──────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  discordId: text("discord_id").unique(),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Sessions (Better Auth) ─────────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Accounts (Better Auth) ─────────────────────────────────────────────────────

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Verifications (Better Auth) ─────────────────────────────────────────────────

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Guilds ─────────────────────────────────────────────────────────────────────

export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  serverType: text("server_type"),
  settings: jsonb("settings").notNull().default({}),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  currentPlanId: uuid("current_plan_id"),
  lockAcquiredAt: timestamp("lock_acquired_at"),
  lockAcquiredBy: text("lock_acquired_by"),
  lockLastHeartbeatAt: timestamp("lock_last_heartbeat_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── App Settings ───────────────────────────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Plans ──────────────────────────────────────────────────────────────────────

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    status: text("status").notNull().default("draft"),
    userPrompt: text("user_prompt").notNull(),
    serverType: text("server_type"),
    planData: jsonb("plan_data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    executedAt: timestamp("executed_at"),
    completedAt: timestamp("completed_at"),
    error: jsonb("error"),
  },
  (table) => [
    index("idx_plans_guild_id").on(table.guildId),
    index("idx_plans_user_id").on(table.userId),
  ]
);

// ── Snapshots ──────────────────────────────────────────────────────────────────

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    planId: uuid("plan_id").references(() => plans.id),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_snapshots_guild_type").on(table.guildId, table.type),
    index("idx_snapshots_expires_at").on(table.expiresAt),
    index("idx_snapshots_plan_id").on(table.planId),
  ]
);

// ── Conversations ─────────────────────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("active"),
    userPrompt: text("user_prompt").notNull(),
    messages: jsonb("messages").notNull().default([]),
    forkStateHash: text("fork_state_hash").notNull(),
    modelId: text("model_id"),
    reasoning: jsonb("reasoning"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_conversations_guild_id").on(table.guildId)]
);

// ── Plan Iterations ────────────────────────────────────────────────────────────

export const planIterations = pgTable(
  "plan_iterations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    version: integer("version").notNull(),
    type: text("type").notNull(),
    desiredState: jsonb("desired_state").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_plan_iterations_conversation_id").on(table.conversationId),
    uniqueIndex("uniq_plan_iterations_conversation_version").on(
      table.conversationId,
      table.version
    ),
  ]
);

// ── Rules ──────────────────────────────────────────────────────────────────────

export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    ruleText: text("rule_text").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_rules_guild_id").on(table.guildId)]
);

// ── Templates ──────────────────────────────────────────────────────────────────

export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull().default(1),
    name: text("name").notNull(),
    description: text("description").notNull(),
    structure: jsonb("structure").notNull(),
    validationRules: jsonb("validation_rules").notNull().default([]),
    category: text("category"),
    tags: text("tags").array().notNull().default([]),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    isOfficial: boolean("is_official").notNull().default(false),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => []
);

export const templateAuthoringTurns = pgTable(
  "template_authoring_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    prompt: text("prompt").notNull(),
    baseVersion: integer("base_version").notNull(),
    messages: jsonb("messages").notNull().default([]),
    status: text("status").notNull().default("planning"),
    summary: text("summary"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_turns_template_created").on(table.templateId, table.createdAt),
    index("idx_template_turns_author").on(table.authorId),
  ]
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    structure: jsonb("structure").notNull(),
    source: text("source").notNull(),
    authoringTurnId: uuid("authoring_turn_id").references(() => templateAuthoringTurns.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_versions_template_created").on(table.templateId, table.createdAt),
    uniqueIndex("uniq_template_versions_template_version").on(table.templateId, table.version),
  ]
);

// ── Drift Events ──────────────────────────────────────────────────────────────

export const driftEvents = pgTable(
  "drift_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guildId: text("guild_id")
      .notNull()
      .references(() => guilds.id),
    severity: text("severity").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("idx_drift_events_guild_created").on(table.guildId, table.createdAt),
    index("idx_drift_events_unresolved").on(table.guildId, table.resolvedAt),
  ]
);

// ── Relations ──────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  plans: many(plans),
  templates: many(templates),
  templateAuthoringTurns: many(templateAuthoringTurns),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const guildsRelations = relations(guilds, ({ many }) => ({
  plans: many(plans),
  snapshots: many(snapshots),
  rules: many(rules),
  conversations: many(conversations),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  guild: one(guilds, { fields: [plans.guildId], references: [guilds.id] }),
  user: one(users, { fields: [plans.userId], references: [users.id] }),
  conversation: one(conversations, {
    fields: [plans.conversationId],
    references: [conversations.id],
  }),
  snapshots: many(snapshots),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  guild: one(guilds, { fields: [snapshots.guildId], references: [guilds.id] }),
  plan: one(plans, { fields: [snapshots.planId], references: [plans.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  guild: one(guilds, { fields: [conversations.guildId], references: [guilds.id] }),
  user: one(users, { fields: [conversations.userId], references: [users.id] }),
  plans: many(plans),
  planIterations: many(planIterations),
}));

export const planIterationsRelations = relations(planIterations, ({ one }) => ({
  conversation: one(conversations, {
    fields: [planIterations.conversationId],
    references: [conversations.id],
  }),
}));

export const rulesRelations = relations(rules, ({ one }) => ({
  guild: one(guilds, { fields: [rules.guildId], references: [guilds.id] }),
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  author: one(users, { fields: [templates.authorId], references: [users.id] }),
  authoringTurns: many(templateAuthoringTurns),
  versions: many(templateVersions),
}));

export const templateAuthoringTurnsRelations = relations(templateAuthoringTurns, ({ one }) => ({
  template: one(templates, {
    fields: [templateAuthoringTurns.templateId],
    references: [templates.id],
  }),
  author: one(users, { fields: [templateAuthoringTurns.authorId], references: [users.id] }),
}));

export const templateVersionsRelations = relations(templateVersions, ({ one }) => ({
  template: one(templates, {
    fields: [templateVersions.templateId],
    references: [templates.id],
  }),
  authoringTurn: one(templateAuthoringTurns, {
    fields: [templateVersions.authoringTurnId],
    references: [templateAuthoringTurns.id],
  }),
}));

export const driftEventsRelations = relations(driftEvents, ({ one }) => ({
  guild: one(guilds, { fields: [driftEvents.guildId], references: [guilds.id] }),
}));
