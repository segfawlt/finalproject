import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "@repo/db";
import { logger } from "./utils/logger";

/**
 * Run pending Drizzle migrations. Called once during server boot so a
 * fresh deploy never lands in a half-migrated state. Drizzle tracks
 * applied migrations in __drizzle_migrations; this is a no-op if all
 * migrations are already applied.
 */
export async function runMigrations(): Promise<void> {
  const start = Date.now();
  await migrate(db, { migrationsFolder: "./packages/db/drizzle" });
  logger.info({ durationMs: Date.now() - start }, "Migrations applied");
}
