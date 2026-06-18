/**
 * Validate required environment variables at boot. Throws with a clear
 * error message if any are missing or malformed. Called from index.ts
 * before Hono serves any request, so the process never starts in a
 * half-configured state.
 */

const REQUIRED_IN_PROD = [
  "DATABASE_URL",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "WEB_APP_URL",
] as const;

const OPTIONAL_WITH_DEFAULT = ["PORT", "NODE_ENV"] as const;

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function requireInProd(name: string, value: string | undefined): string {
  if (value) return value;
  if (isProd()) {
    throw new Error(
      `Required environment variable ${name} is not set. Refusing to start in production.`
    );
  }
  return "";
}

function requireAlways(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Required environment variable ${name} is not set. Copy .env.example to .env and fill in the value.`
    );
  }
  return value;
}

function validateSecret(name: string, value: string | undefined): string {
  const v = requireAlways(name, value);
  if (v.length < 32) {
    throw new Error(
      `${name} must be at least 32 characters (got ${v.length}). Generate a new one with: openssl rand -base64 32`
    );
  }
  return v;
}

function validateUrl(name: string, value: string | undefined): string {
  const v = requireAlways(name, value);
  try {
    new URL(v);
  } catch {
    throw new Error(`${name} is not a valid URL: ${v}`);
  }
  return v;
}

function validatePort(name: string, value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 65535) {
    throw new Error(`${name} is not a valid port: ${value}`);
  }
  return n;
}

export interface ValidatedEnv {
  DATABASE_URL: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  WEB_APP_URL: string;
  PORT: number;
  NODE_ENV: "development" | "production" | "test";
  LLM_BASE_URL: string;
  LLM_API_KEY: string | null;
  LLM_MODEL: string;
}

export function validateEnv(): ValidatedEnv {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as ValidatedEnv["NODE_ENV"];

  // Secret + URL validators always throw (dev and prod) so misconfig is
  // caught immediately. The prod-only list guards things that are
  // acceptable to default-empty in dev (e.g., discord token during
  // offline coding sessions).
  const validated: ValidatedEnv = {
    DATABASE_URL: requireAlways("DATABASE_URL", process.env.DATABASE_URL),
    BETTER_AUTH_SECRET: validateSecret("BETTER_AUTH_SECRET", process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: validateUrl("BETTER_AUTH_URL", process.env.BETTER_AUTH_URL),
    WEB_APP_URL: validateUrl("WEB_APP_URL", process.env.WEB_APP_URL),
    PORT: validatePort("PORT", process.env.PORT, 3001),
    NODE_ENV: nodeEnv,
    DISCORD_BOT_TOKEN: requireInProd("DISCORD_BOT_TOKEN", process.env.DISCORD_BOT_TOKEN),
    DISCORD_CLIENT_ID: requireInProd("DISCORD_CLIENT_ID", process.env.DISCORD_CLIENT_ID),
    DISCORD_CLIENT_SECRET: requireInProd(
      "DISCORD_CLIENT_SECRET",
      process.env.DISCORD_CLIENT_SECRET
    ),
    LLM_BASE_URL: process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1",
    LLM_API_KEY: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || null,
    LLM_MODEL: process.env.LLM_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  };

  return validated;
}
