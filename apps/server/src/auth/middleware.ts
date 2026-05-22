import { auth } from "./config";
import type { Context, Next } from "hono";

export async function authMiddleware(c: Context, next: Next) {
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!sessionData) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", sessionData.user);
  c.set("session", sessionData.session);

  await next();
}

export async function requireAuth(c: Context, next: Next) {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}
