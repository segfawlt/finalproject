import { test, expect } from "@playwright/test";

const GUILD_ID = "1517217533168582838";
const WRONG_GUILD_ID = "000000000000000001";

// ── ST-01: OAuth-only authentication ─────────────────────────────────────────

test.describe("ST-01: OAuth-only authentication", () => {
  test("login page shows Discord button and no password field", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in with discord/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("email/password sign-in endpoint is not exposed", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: "test@test.com", password: "hunter2" },
    });
    // Better Auth OAuth-only: authenticated requests get 403, unauthenticated get 400
    expect([400, 403]).toContain(res.status());
    if (res.status() === 400) {
      const body = await res.json();
      expect(body.code).toBe("EMAIL_PASSWORD_DISABLED");
    }
  });
});

// ── ST-02: Cross-guild authorization ─────────────────────────────────────────

test.describe("ST-02: Cross-guild authorization", () => {
  test("state endpoint rejects guild user cannot manage", async ({ request }) => {
    const res = await request.get(`/api/guilds/${WRONG_GUILD_ID}/state`);
    expect([403, 404, 503]).toContain(res.status());
  });

  test("plans list rejects guild user cannot manage", async ({ request }) => {
    const res = await request.get(`/api/guilds/${WRONG_GUILD_ID}/plans`);
    expect([403, 404, 503]).toContain(res.status());
  });

  test("conversations list rejects guild user cannot manage", async ({ request }) => {
    const res = await request.get(`/api/guilds/${WRONG_GUILD_ID}/conversations`);
    expect([403, 404, 503]).toContain(res.status());
  });

  test("rules list rejects guild user cannot manage", async ({ request }) => {
    const res = await request.get(`/api/guilds/${WRONG_GUILD_ID}/rules`);
    expect([403, 404, 503]).toContain(res.status());
  });

  test("plan creation rejects guild user cannot manage", async ({ request }) => {
    const res = await request.post(`/api/guilds/${WRONG_GUILD_ID}/plans`, {
      data: {
        userPrompt: "add a channel",
        desiredState: {},
      },
    });
    expect([403, 404, 503]).toContain(res.status());
  });

  test("conversation creation rejects guild user cannot manage", async ({ request }) => {
    const res = await request.post(`/api/guilds/${WRONG_GUILD_ID}/conversations`, {
      data: { userPrompt: "add a channel" },
    });
    expect([403, 404, 503]).toContain(res.status());
  });

  test("unauthenticated request to protected endpoint returns 401", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const req = await ctx.request.get(`http://localhost:5173/api/guilds/${GUILD_ID}/state`);
    expect(req.status()).toBe(401);
    await ctx.close();
  });

  test("unauthenticated plan execution attempt returns 401", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const req = await ctx.request.post(
      `http://localhost:5173/api/guilds/${GUILD_ID}/plans/fake-plan-id/execute`
    );
    expect(req.status()).toBe(401);
    await ctx.close();
  });
});

// ── ST-13: Template read authorization ────────────────────────────────────────

test.describe("ST-13: Template read authorization", () => {
  test("authorized user can list templates for own guild", async ({ request }) => {
    const res = await request.get(`/api/guilds/${GUILD_ID}/templates`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("unauthenticated user cannot list templates", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const res = await ctx.request.get(
      `http://localhost:5173/api/guilds/${GUILD_ID}/templates`
    );
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("unauthenticated user cannot read specific template", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const res = await ctx.request.get(
      `http://localhost:5173/api/guilds/${GUILD_ID}/templates/any-template-id`
    );
    expect(res.status()).toBe(401);
    await ctx.close();
  });

  test("guild-scoped template creation requires manage permission", async ({ request, browser }) => {
    const templateId = `test-st13-${Date.now()}`;
    const res = await request.post(`/api/guilds/${GUILD_ID}/templates`, {
      data: {
        id: templateId,
        name: "ST-13 test template",
        description: "Created during ST-13 authorization test",
        structure: { channels: [], roles: [] },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.guildId).toBe(GUILD_ID);

    // Unauthorized user cannot read the guild-scoped template
    const ctx = await browser.newContext({ storageState: undefined });
    const readRes = await ctx.request.get(
      `http://localhost:5173/api/guilds/${GUILD_ID}/templates/${templateId}`
    );
    expect(readRes.status()).toBe(401);
    await ctx.close();

    // Cleanup
    await request.delete(`/api/guilds/${GUILD_ID}/templates/${templateId}`);
  });
});
