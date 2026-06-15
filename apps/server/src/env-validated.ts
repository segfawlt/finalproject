import { validateEnv, type ValidatedEnv } from "./env";

/**
 * Singleton env validated once at import time. Throws immediately if any
 * required variable is missing or malformed. Import this from any module
 * that needs config (instead of reading process.env directly) so the
 * failure surfaces during boot rather than at first request.
 */
let cached: ValidatedEnv | null = null;

export function getValidatedEnv(): ValidatedEnv {
  if (!cached) {
    cached = validateEnv();
  }
  return cached;
}

export const validatedEnv = getValidatedEnv();
