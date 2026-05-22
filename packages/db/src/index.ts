import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgresql://dev:dev@localhost:5432/discord_platform";

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema });

export { queryClient };

export * from "./schema";
