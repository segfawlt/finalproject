import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const authFile = "e2e/.auth/user.json";

/**
 * One-time interactive login. Run headed:
 *   pnpm exec playwright test --project=setup --headed
 *
 * The browser opens on /login. Click "Sign in with Discord" and complete the
 * OAuth flow yourself (the assistant never sees or types credentials). Once the
 * app lands on /studio, the session cookie is saved to e2e/.auth/user.json and
 * every other spec reuses it.
 *
 * If a valid saved session already exists this step is a fast no-op.
 */
setup("authenticate", async ({ page }) => {
  // Fast path: reuse a saved session if it still resolves /studio.
  if (fs.existsSync(authFile)) {
    await page.context().addCookies(loadCookies());
    await page.goto("/studio");
    if (await isLoggedIn(page)) {
      await page.context().storageState({ path: authFile });
      return;
    }
  }

  await page.goto("/login");
  await expect(page.getByRole("button", { name: /sign in with discord/i })).toBeVisible();

  // Wait for the human to finish OAuth. 3 minutes is generous for MFA / device
  // approval. Success = we're on /studio with the app shell rendered.
  await page.waitForURL("**/studio**", { timeout: 180_000 });
  await expect(page.getByText(/loading/i)).toHaveCount(0, { timeout: 15_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});

function loadCookies() {
  const raw = JSON.parse(fs.readFileSync(authFile, "utf8"));
  return raw.cookies ?? [];
}

async function isLoggedIn(page: import("@playwright/test").Page): Promise<boolean> {
  try {
    await page.waitForURL("**/studio**", { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}
