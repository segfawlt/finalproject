CREATE TABLE "drift_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" text NOT NULL,
	"severity" text NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_drift_events_guild_created" ON "drift_events" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_drift_events_unresolved" ON "drift_events" USING btree ("guild_id","resolved_at");