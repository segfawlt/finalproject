CREATE TABLE "template_authoring_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"author_id" text NOT NULL,
	"prompt" text NOT NULL,
	"base_version" integer NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'planning' NOT NULL,
	"summary" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"structure" jsonb NOT NULL,
	"source" text NOT NULL,
	"authoring_turn_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DELETE FROM "templates" WHERE "author_id" IS NULL;
--> statement-breakpoint
INSERT INTO "template_versions" ("template_id", "version", "structure", "source")
SELECT "id", "version", "structure", 'initial' FROM "templates";
--> statement-breakpoint
ALTER TABLE "templates" DROP CONSTRAINT "templates_guild_id_guilds_id_fk";
--> statement-breakpoint
DROP INDEX "idx_templates_guild_id";--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "author_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "template_authoring_turns" ADD CONSTRAINT "template_authoring_turns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_authoring_turns" ADD CONSTRAINT "template_authoring_turns_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_authoring_turn_id_template_authoring_turns_id_fk" FOREIGN KEY ("authoring_turn_id") REFERENCES "public"."template_authoring_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_template_turns_template_created" ON "template_authoring_turns" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_template_turns_author" ON "template_authoring_turns" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "idx_template_versions_template_created" ON "template_versions" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_template_versions_template_version" ON "template_versions" USING btree ("template_id","version");--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "guild_id";
