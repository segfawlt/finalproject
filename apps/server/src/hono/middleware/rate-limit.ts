import type { Context } from "hono";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (entry.resetAt < now) {
      requestCounts.delete(ip);
    }
  }
}

/**
 * Create a rate limiter middleware.
 * @param options.maxRequests - maximum requests allowed in the window
 * @param options.windowMs - time window in milliseconds
 */
export function rateLimit(options: { maxRequests: number; windowMs: number }) {
  const { maxRequests, windowMs } = options;

  return async (c: Context, next: () => Promise<void>) => {
    const ip = c.req.header("x-forwarded-for") ?? "unknown";
    const now = Date.now();

    const entry = requestCounts.get(ip);
    if (entry && entry.resetAt > now) {
      if (entry.count >= maxRequests) {
        return c.json({ error: "Rate limit exceeded. Please try again later." }, 429);
      }
      entry.count++;
    } else {
      requestCounts.set(ip, { count: 1, resetAt: now + windowMs });
    }

    await next();
  };
}

// Clean up expired entries every minute to prevent memory leak
setInterval(cleanupExpiredEntries, 60 * 1000);
