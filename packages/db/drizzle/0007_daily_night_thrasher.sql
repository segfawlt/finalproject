DROP INDEX "idx_plan_iterations_conversation_version";--> statement-breakpoint
CREATE INDEX "idx_conversations_guild_id" ON "conversations" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_plan_iterations_conversation_id" ON "plan_iterations" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_plan_iterations_conversation_version" ON "plan_iterations" USING btree ("conversation_id","version");--> statement-breakpoint
CREATE INDEX "idx_plans_guild_id" ON "plans" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_plans_user_id" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_rules_guild_id" ON "rules" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "idx_templates_guild_id" ON "templates" USING btree ("guild_id");