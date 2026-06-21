/**
 * Parse the JSON payload of a Server-Sent Event MessageEvent.
 * Returns null when the payload is empty or unparseable, so callers
 * can early-return without wrapping the JSON call in try/catch.
 */
export function parseSseData<T = unknown>(e: Event): T | null {
  const me = e as MessageEvent;
  if (!me.data) return null;
  try {
    return JSON.parse(me.data) as T;
  } catch {
    return null;
  }
}
