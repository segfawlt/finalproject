CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"user_prompt" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fork_state_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_iterations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"type" text NOT NULL,
	"desired_state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "guild_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_iterations" ADD CONSTRAINT "plan_iterations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_iterations_conversation_version" ON "plan_iterations" USING btree ("conversation_id","version");--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;