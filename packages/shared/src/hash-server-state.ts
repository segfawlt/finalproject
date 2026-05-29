import { createHash } from "crypto";

/**
 * Hash a ServerState for fork point comparison.
 * Returns a SHA-256 hex string of a stable-ordered JSON representation.
 *
 * This is a server-side utility only (uses Node.js crypto).
 */
export function hashServerState(state: Record<string, unknown>): string {
  const stable = stableStringify(state);
  return createHash("sha256").update(stable).digest("hex");
}

function stableStringify(obj: unknown): string {
  if (typeof obj !== "object" || obj === null) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const key of keys) {
    sorted[key] = (obj as Record<string, unknown>)[key];
  }
  return JSON.stringify(sorted);
}
