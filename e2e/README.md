# E2E Live-Environment Harness

Playwright specs that drive the running app (`localhost:5173`) to capture **real**
report evidence for the system-test scenarios (`ST-*`, `PF-*`) that unit tests
cannot cover. Nothing here is scored code — it produces evidence, not features.

## Why the split

This sandbox cannot open a raw Postgres connection to the remote Neon DB (only
ports 80/443 are allowed outbound). So the server must run in **your** terminal,
where Neon/Discord/LLM are reachable. Playwright then drives the browser against
`localhost:5173`, whose Vite proxy forwards `/api` to your server on `:3001`.
Localhost is not sandboxed, so this works.

## One-time setup

1. **You**, in your own terminal (not inside Claude Code):

   ```bash
   pnpm dev          # web :5173 | server :3001
   ```

2. Capture a logged-in session once (opens a real browser):

   ```bash
   pnpm e2e:auth     # → playwright test --project=setup --headed
   ```

   Click **Sign in with Discord** and finish OAuth yourself. The assistant never
   sees or types credentials. On landing at `/studio`, the session is saved to
   `e2e/.auth/user.json` (gitignored — never committed).

## Running scenarios

```bash
pnpm e2e            # runs the chromium project, reusing the saved session
pnpm e2e:report     # open the HTML report (traces + screenshots)
```

### Manual Discord scenarios

ST-08 creates a draft plan tied to a conversation's fork state, then waits up
to five minutes for you to rename or move any existing channel directly in
Discord. Once the running app's cached state changes, it verifies that execution
is rejected as stale. It does not need an LLM provider.

```bash
RUN_MANUAL_DISCORD_TESTS=1 pnpm exec playwright test e2e/st-planning.spec.ts \
  --project=chromium --headed -g "external Discord edit"
```

The test is skipped during normal `pnpm e2e` runs, so it never waits for a
manual action in CI or a routine evidence run.

ST-14 subscribes to the drift SSE before the same type of manual channel edit.

```bash
RUN_MANUAL_DISCORD_TESTS=1 pnpm exec playwright test e2e/st-persistence.spec.ts \
  --project=chromium --headed -g "direct channel edit"
```

## Files

| File                      | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `../playwright.config.ts` | projects: `setup` (login capture) → `chromium` (scenarios)     |
| `auth.setup.ts`           | interactive OAuth capture → `.auth/user.json`; reuses if valid |
| `smoke.spec.ts`           | pipeline sanity: auth reuse, routing, ST-01 no-password check  |

Scenario specs (`ST-*`, `PF-*`) are added once the smoke run is green against
the live DOM.
