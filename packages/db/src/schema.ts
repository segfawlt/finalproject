import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  uuid,
  integer,
  index,
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
  phaseProgress: jsonb("phase_progress").notNull().default({
    foundation: false,
    layout: false,
    access: false,
    people: false,
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Plans ──────────────────────────────────────────────────────────────────────

export const plans = pgTable("plans", {
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
});

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

export const conversations = pgTable("conversations", {
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
    index("idx_plan_iterations_conversation_version").on(table.conversationId, table.version),
  ]
);

// ── Rules ──────────────────────────────────────────────────────────────────────

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  guildId: text("guild_id")
    .notNull()
    .references(() => guilds.id),
  ruleText: text("rule_text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Templates ──────────────────────────────────────────────────────────────────

export const templates = pgTable("templates", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  name: text("name").notNull(),
  description: text("description").notNull(),
  structure: jsonb("structure").notNull(),
  questions: jsonb("questions").notNull().default([]),
  validationRules: jsonb("validation_rules").notNull().default([]),
  category: text("category"),
  tags: text("tags").array().notNull().default([]),
  guildId: text("guild_id").references(() => guilds.id),
  authorId: text("author_id").references(() => users.id),
  isOfficial: boolean("is_official").notNull().default(false),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
}));

export const guildsRelations = relations(guilds, ({ many }) => ({
  plans: many(plans),
  snapshots: many(snapshots),
  rules: many(rules),
  conversations: many(conversations),
  templates: many(templates),
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

export const templatesRelations = relations(templates, ({ one }) => ({
  guild: one(guilds, { fields: [templates.guildId], references: [guilds.id] }),
  author: one(users, { fields: [templates.authorId], references: [users.id] }),
}));

export const driftEventsRelations = relations(driftEvents, ({ one }) => ({
  guild: one(guilds, { fields: [driftEvents.guildId], references: [guilds.id] }),
}));
