ALTER TABLE "guilds" ADD COLUMN "lock_acquired_at" timestamp;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "lock_acquired_by" text;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "lock_last_heartbeat_at" timestamp;