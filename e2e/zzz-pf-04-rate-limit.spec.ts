import { test, expect } from "@playwright/test";

// PF-04: API rate limiting.
// Named zzz- so it sorts and runs strictly last in the suite — it exhausts
// the 100 req/min window for the test IP and would poison every other API
// test with 429s if it ran earlier.

test.describe("PF-04: API rate limiting", () => {
  test("more than 100 requests per minute receive 429 responses", async ({ request }) => {
    const BURST = 110;
    const responses: number[] = [];

    for (let i = 0; i < BURST; i++) {
      const res = await request.get(`/api/health`);
      responses.push(res.status());
    }

    const rateLimited = responses.filter((s) => s === 429);
    const ok = responses.filter((s) => s === 200);

    console.log(`PF-04: ${ok.length} OK, ${rateLimited.length} rate-limited out of ${BURST}`);

    expect(rateLimited.length).toBeGreaterThan(0);
    expect(ok.length).toBeGreaterThan(0);

    const probeRes = await request.get(`/api/health`);
    if (probeRes.status() === 429) {
      const body = await probeRes.json();
      expect(body.error).toMatch(/rate limit/i);
    }
  });
});
