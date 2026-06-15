import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@repo/db";
import { validatedEnv } from "../env-validated";

export const auth = betterAuth({
  secret: validatedEnv.BETTER_AUTH_SECRET,
  baseURL: validatedEnv.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  socialProviders: {
    discord: {
      clientId: validatedEnv.DISCORD_CLIENT_ID,
      clientSecret: validatedEnv.DISCORD_CLIENT_SECRET,
    },
  },
  user: {
    additionalFields: {
      subscriptionTier: {
        type: "string",
        defaultValue: "free",
        input: false,
      },
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
