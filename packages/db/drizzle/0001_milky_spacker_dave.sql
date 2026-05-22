ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "current_plan_id" uuid;