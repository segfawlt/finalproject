import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { authMiddleware } from "../auth/middleware";
import { auth } from "../auth/config";
import { db } from "@repo/db";
import type { AppVariables } from "../types";
import guildsApp from "./routes/guilds";
import rulesApp from "./routes/rules";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_APP_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/health", async (c) => {
  let dbStatus: string;
  try {
    await db.execute("SELECT 1");
    dbStatus = "connected";
  } catch {
    dbStatus = "disconnected";
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

const api = new Hono<{ Variables: AppVariables }>();
api.use("*", authMiddleware);

api.get("/me", (c) => {
  const user = c.get("user");
  const session = c.get("session");
  return c.json({ user, session });
});

api.get("/plan/:id/stream", async (c) => {
  const planId = c.req.param("id");

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "status",
      data: JSON.stringify({ planId, status: "streaming_ready" }),
    });

    while (!stream.aborted) {
      await stream.sleep(30000);
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }
  });
});

api.route("/guilds", guildsApp);
api.route("/guilds/:guildId/rules", rulesApp);

app.route("/api", api);

export default app;
