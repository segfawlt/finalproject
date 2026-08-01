import { test, expect } from "@playwright/test";

/**
 * Harness smoke test — validates the whole pipeline (storageState reuse, Vite
 * proxy to :3001, authenticated routing) before the scenario suite is built.
 *
 * Not a scored scenario. If this is green, ST-* specs can be written against a
 * known-good live DOM.
 */
test("authenticated session lands on the studio hub", async ({ page }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/studio/);
  // The guild picker heading is the stable anchor of the no-guild hub.
  await expect(page.getByText(/select a guild to plan against/i)).toBeVisible({ timeout: 15_000 });
});

test("no password form is exposed (ST-01 boundary check)", async ({ page }) => {
  // Better Auth is OAuth-only; there must be no local password field anywhere
  // on the login surface. Verifies the ST-01 "no local password form" claim.
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in with discord/i })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});
