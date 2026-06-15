import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { authMiddleware, requireUser } from "../auth/middleware";
import { auth } from "../auth/config";
import { userHasManageGuild, DiscordApiError } from "../auth/helpers";
import { botClient } from "../bot/client";
import { botReady } from "../bot";
import { db, plans, conversations } from "@repo/db";
import type { AppVariables } from "../types";
import guildsApp from "./routes/guilds";
import rulesApp from "./routes/rules";
import stateApp from "./routes/state";
import plansApp from "./routes/plans";
import conversationsApp from "./routes/conversations";
import templatesApp from "./routes/templates";
import botApp from "./routes/bot";
import { rateLimit } from "./middleware/rate-limit";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof DiscordApiError) {
    return c.json(
      { error: "Discord API is temporarily unavailable. Please retry." },
      503
    );
  }
  return c.json({ error: "Internal server error" }, 500);
});

app.use(
  "/api/*",
  cors({
    origin: process.env.WEB_APP_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use("/api/*", rateLimit({ maxRequests: 100, windowMs: 60 * 1000 }));

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
    botConnected: botClient.isReady(),
  });
});

const api = new Hono<{ Variables: AppVariables }>();

// Block every API request until the bot has logged in and the guild
// cache has been populated. Without this, the first request after every
// restart can read an empty cache and silently corrupt the planning
// contract (fork hash from [], beforeSnapshot empty, etc).
api.use("*", async (_c, next) => {
  await botReady;
  await next();
});

api.use("*", authMiddleware);

api.get("/me", (c) => {
  const user = requireUser(c);
  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
    },
  });
});

api.get("/plan/:id/stream", async (c) => {
  const user = requireUser(c);
  const planId = c.req.param("id");

  const [plan] = await db
    .select({ guildId: plans.guildId })
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  if (!plan) {
    return c.json({ error: "Plan not found" }, 404);
  }

  const hasAccess = await userHasManageGuild(user.id, plan.guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return streamSSE(c, async (stream) => {
    const { subscribeToPlan } = await import("../planning/event-bus");

    await stream.writeSSE({
      event: "status",
      data: JSON.stringify({ planId, status: "streaming_ready" }),
    });

    // Subscribe to execution events for this plan
    const unsubscribe = subscribeToPlan(planId, async (event) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify({
          planId: event.planId,
          stepIndex: event.stepIndex,
          error: event.error,
          result: event.result,
        }),
      });
    });

    // Keep alive with heartbeat every 30s
    while (!stream.aborted) {
      await stream.sleep(30000);
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }

    unsubscribe();
  });
});

api.get("/conversations/:id/stream", async (c) => {
  const user = requireUser(c);
  const conversationId = c.req.param("id");

  const [conv] = await db
    .select({ guildId: conversations.guildId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const hasAccess = await userHasManageGuild(user.id, conv.guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return streamSSE(c, async (stream) => {
    const { subscribeToConversation } = await import("../planning/planning-event-bus");

    await stream.writeSSE({
      event: "status",
      data: JSON.stringify({ conversationId, status: "streaming_ready" }),
    });

    const unsubscribe = subscribeToConversation(conversationId, async (event) => {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify({
          conversationId,
          toolName: event.toolName,
          params: event.params,
          result: event.result,
          question: event.question,
          options: event.options,
          multiSelect: event.multiSelect,
          allowCustom: event.allowCustom,
          summary: event.summary,
          reasoning: event.reasoning,
          error: event.error,
        }),
      });
    });

    while (!stream.aborted) {
      await stream.sleep(30000);
      await stream.writeSSE({
        event: "heartbeat",
        data: JSON.stringify({ timestamp: Date.now() }),
      });
    }

    unsubscribe();
  });
});

api.route("/guilds", guildsApp);
api.route("/guilds/:guildId/rules", rulesApp);
api.route("/guilds/:guildId", stateApp);
api.route("/guilds/:guildId/plans", plansApp);
api.route("/guilds/:guildId/conversations", conversationsApp);
api.route("/guilds/:guildId/templates", templatesApp);
api.route("/bot", botApp);

app.route("/api", api);

export default app;
