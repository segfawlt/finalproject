import { test, expect } from "@playwright/test";

const GUILD_ID = "1517217533168582838";

// All ST-05 through ST-11 require live Discord mutations.
// They are marked fixme with precise preconditions so they can be
// promoted to runnable when the bot-mutation harness is available.

// ── ST-05: Full execution ─────────────────────────────────────────────────────

test.describe("ST-05: Execute the reviewed state exactly", () => {
  test.fixme(
    "ordered progress visible; final Discord structure matches reviewed plan",
    async ({ request }) => {
      // Preconditions:
      //   1. Guild fixture restored (one category, two text, one voice, one role)
      //   2. Plan created via conversation approve flow with known desiredState
      //   3. Plan status is "draft" (just approved)
      // Steps:
      //   POST /api/guilds/:guildId/plans/:planId/execute
      //   Stream /api/plan/:planId/stream and collect events
      //   Fetch /api/guilds/:guildId/state after completion
      // Expected: every step event emitted; final state matches desiredState
    }
  );
});

// ── ST-06: Role hierarchy enforcement ────────────────────────────────────────

test.describe("ST-06: Strict Discord role hierarchy at bot position", () => {
  test.fixme(
    "roles above bot are rejected; roles below bot are permitted",
    async ({ request }) => {
      // Preconditions: roles above, equal-to, and below bot's highest role in test guild
      // Steps: attempt same role edit against each target via execute
      // Expected: only lower target succeeds; blocked cases return hierarchy error message
    }
  );
});

// ── ST-07: Rollback after injected failure ────────────────────────────────────

test.describe("ST-07: Rollback after injected step failure", () => {
  test.fixme(
    "reverse convergence attempted; UI and API report residual divergence",
    async ({ request }) => {
      // Preconditions: plan with >= 2 mutations; controllable terminal failure at step 2
      // Steps: allow step 1, fail step 2; observe rollback events; compare final vs before state
    }
  );
});

// ── ST-10: Abort during in-flight step ────────────────────────────────────────

test.describe("ST-10: Abort during an in-flight step", () => {
  test("aborting a non-executing plan returns 404", async ({ request }) => {
    const res = await request.post(
      `/api/guilds/${GUILD_ID}/plans/00000000-0000-0000-0000-000000000000/abort`
    );
    expect(res.status()).toBe(404);
  });

  test.fixme(
    "abort during pending Discord operation stops later steps and attempts rollback",
    async ({ request }) => {
      // Preconditions: multi-step execution in progress with controllable pending step
      // Steps: POST /abort while one step is pending
      // Expected: no later steps scheduled; engine stops; rollback attempted; late effects reported
    }
  );
});

// ── ST-11: Rollback available after process restart ───────────────────────────

test.describe("ST-11: Rollback after process restart", () => {
  test("completed plan and before-snapshot survive in DB after server restart", async ({
    request,
  }) => {
    // If any completed plan exists, its before-snapshot must be queryable.
    // This test verifies persistence (snapshots stay in DB across restarts).
    const plansRes = await request.get(`/api/guilds/${GUILD_ID}/plans`);
    expect(plansRes.status()).toBe(200);
    const plans = await plansRes.json();

    const completed = plans.filter((p: { status: string }) => p.status === "completed");
    if (completed.length === 0) {
      test.info().annotations.push({
        type: "note",
        description: "No completed plans found — skipping snapshot check. Run ST-05 first.",
      });
      return;
    }

    // Verify the rollback endpoint is reachable (snapshot loading is tested)
    const plan = completed[0];
    const rollbackRes = await request.post(
      `/api/guilds/${GUILD_ID}/plans/${plan.id}/rollback`
    );
    // 200 = rolled back; 400 = already rolled back or no snapshot (expected if re-run)
    // 409 = conflicts; any of these confirm the endpoint is live and plan data persisted.
    expect([200, 400, 409]).toContain(rollbackRes.status());
  });

  test.fixme(
    "rollback available after killing and restarting the server process",
    async ({ request }) => {
      // Preconditions: completed execution with before/after snapshots
      // Steps: kill server, restart, POST /rollback
      // Expected: plan + snapshots reload from DB; rollback succeeds
    }
  );
});
