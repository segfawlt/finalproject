import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness for live-environment report evidence.
 *
 * The Vite dev server (:5173) proxies /api to the Hono server (:3001), so all
 * traffic is same-origin from the browser's perspective and Better Auth cookies
 * flow through automatically. We do NOT start the dev server here — it must run
 * in the user's own terminal (the sandbox cannot reach the remote Neon DB), and
 * `reuseExistingServer` is irrelevant because there is no webServer block.
 *
 * Auth: the `setup` project captures a logged-in session once (interactive
 * Discord OAuth) into e2e/.auth/user.json; every other project reuses it via
 * storageState so specs never touch credentials.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
});
