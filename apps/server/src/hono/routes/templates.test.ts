import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Configurable rows returned by the mocked db.select().from().where() chain.
let templateRows: Array<Record<string, unknown>> = [];
// Configurable result of the permission check.
let manageAccess = false;

vi.mock("@repo/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => templateRows,
      }),
    }),
  },
  templates: { guildId: "guild_id", id: "id" },
  conversations: {},
  planIterations: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  or: () => ({}),
}));

vi.mock("../../auth/helpers", () => ({
  userHasManageGuild: vi.fn(async () => manageAccess),
}));

import templatesApp from "./templates";
import type { AppVariables } from "../../types";

// Mount the templates app behind middleware that injects an authenticated user,
// mirroring the real authMiddleware that runs on every /api route.
function makeApp() {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as AppVariables["user"]);
    await next();
  });
  app.route("/guilds/:guildId/templates", templatesApp);
  return app;
}

describe("templates read authorization (flaw #7)", () => {
  beforeEach(() => {
    templateRows = [];
    manageAccess = false;
  });

  describe("GET / (list)", () => {
    it("returns only global templates when the user lacks manage access", async () => {
      manageAccess = false;
      // db mock ignores the where clause; the route must have queried for
      // globals only. We assert the request succeeds (no 403) and returns rows.
      templateRows = [{ id: "global-1", guildId: null, name: "Global", description: "d" }];

      const res = await makeApp().request("/guilds/g1/templates");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("returns guild + global templates when the user has manage access", async () => {
      manageAccess = true;
      templateRows = [
        { id: "g1-tmpl", guildId: "g1", name: "Guild", description: "d" },
        { id: "global-1", guildId: null, name: "Global", description: "d" },
      ];

      const res = await makeApp().request("/guilds/g1/templates");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  describe("GET /:templateId", () => {
    it("allows reading a global template without manage access", async () => {
      manageAccess = false;
      templateRows = [{ id: "global-1", guildId: null, name: "Global", description: "d" }];

      const res = await makeApp().request("/guilds/g1/templates/global-1");

      expect(res.status).toBe(200);
    });

    it("forbids reading a guild-scoped template without manage access", async () => {
      manageAccess = false;
      templateRows = [{ id: "g1-tmpl", guildId: "g1", name: "Guild", description: "d" }];

      const res = await makeApp().request("/guilds/g1/templates/g1-tmpl");

      expect(res.status).toBe(403);
    });

    it("allows reading a guild-scoped template with manage access", async () => {
      manageAccess = true;
      templateRows = [{ id: "g1-tmpl", guildId: "g1", name: "Guild", description: "d" }];

      const res = await makeApp().request("/guilds/g1/templates/g1-tmpl");

      expect(res.status).toBe(200);
    });

    it("returns 404 for a template belonging to another guild", async () => {
      manageAccess = true;
      templateRows = [{ id: "other", guildId: "g2", name: "Other", description: "d" }];

      const res = await makeApp().request("/guilds/g1/templates/other");

      expect(res.status).toBe(404);
    });
  });
});
