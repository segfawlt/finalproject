import { auth } from "./config";
import { HTTPException } from "hono/http-exception";
import type { Context, Next } from "hono";
import type { AppVariables, AuthUser } from "../types";

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

/**
 * Return the authenticated user or throw 401. Use in route handlers after
 * authMiddleware has run. Throws HTTPException so the global onError handler
 * can convert it to a JSON response.
 */
export function requireUser(c: Context<{ Variables: AppVariables }>): AuthUser {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return user;
}
