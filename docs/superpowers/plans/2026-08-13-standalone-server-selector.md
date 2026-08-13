# Standalone Server Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/studio` render only the dark server selector, refresh control, and dynamic logged-in account indicator, while preserving the full Studio shell at `/studio/:guildId`.

**Architecture:** Keep the existing guild fetch/state logic in `Studio.tsx`, but return a standalone selector branch before constructing/rendering `StudioShell` when no `guildId` exists. The guild-specific route continues through the current shell unchanged. Reuse the existing selector CSS and add only the standalone layout styles needed.

**Tech Stack:** React 18, React Router, Zustand auth store, Tailwind CSS 3, TypeScript, Vitest, Testing Library.

---

### Task 1: Add standalone selector coverage

**Files:**
- Modify: `apps/web/src/routes/Studio.test.tsx`
- Inspect: `apps/web/src/routes/Studio.tsx`
- Inspect: `apps/web/src/stores/authStore.ts`

- [ ] **Step 1: Extend the auth-store test mock with a named user**

Configure the existing auth mock so `useAuthStore` returns an authenticated user such as `{ name: "Alex" }` for the selector test. Keep any existing store selectors required by guild-specific Studio tests.

- [ ] **Step 2: Write the failing standalone-composition test**

Render the no-`guildId` Studio route with two available guilds and assert:

```ts
expect(screen.getByText("Logged in as Alex")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Refresh guilds" })).toBeInTheDocument();
expect(screen.queryByRole("banner")).not.toBeInTheDocument();
expect(screen.queryByText("Recent conversations")).not.toBeInTheDocument();
expect(screen.queryByText("Templates")).not.toBeInTheDocument();
```

Use stable text/roles from the actual implementation. Do not assert implementation-specific shell class names.

- [ ] **Step 3: Write the fallback identity test**

Render with `user: null` while the route is authenticated through the existing test harness and assert the selector uses `Logged in as User` rather than crashing or rendering an empty label.

- [ ] **Step 4: Run the focused tests to confirm the new assertions fail**

Run:

```bash
pnpm exec vitest run apps/web/src/routes/Studio.test.tsx
```

Expected: the new standalone composition assertions fail because the current no-guild view is wrapped in `StudioShell` and has no account indicator.

### Task 2: Render `/studio` as a standalone selector

**Files:**
- Modify: `apps/web/src/routes/Studio.tsx`
- Modify: `apps/web/src/index.css` only if standalone layout rules are needed
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Read the authenticated user name from the auth store**

Add a granular selector near the existing Studio store selectors:

```ts
const user = useAuthStore((state) => state.user);
```

Use `user?.name || "User"` for the displayed identity. Do not add logout or account actions.

- [ ] **Step 2: Extract the no-guild JSX into an early standalone return**

Before the existing `return <StudioShell ...>`, add:

```tsx
if (!guildId) {
  return (
    <main className="studio-server-selector-page">
      <div className="studio-server-selector-account">Logged in as {user?.name || "User"}</div>
      <section className="studio-server-selector-content" aria-labelledby="server-selector-title">
        ...existing heading, refresh control, loading/error/empty/invite branches, and guild rows...
      </section>
    </main>
  );
}
```

Move the existing no-guild selector branch into this return rather than duplicating it. Keep `loadGuildPicker`, `selectingGuildId`, guild metadata/icon fallback, native `href`, and click state unchanged. The full `StudioShell` return should now be reachable only when `guildId` is present.

- [ ] **Step 3: Remove no-guild shell slots and related conditional duplication**

Keep the existing `StudioShell` header/sidebar/right-panel wiring for the guild-specific path. Do not pass an empty sidebar/header to hide chrome; the early return must structurally prevent those components from rendering on `/studio`.

- [ ] **Step 4: Add standalone responsive layout styles**

Add namespaced CSS in `apps/web/src/index.css`:

```css
.studio-server-selector-page {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  background: #000;
  color: #f5f5f5;
}

.studio-server-selector-content {
  width: min(100%, 42rem);
}

.studio-server-selector-account {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  color: #737373;
  font-size: 0.75rem;
}

@media (max-width: 640px) {
  .studio-server-selector-page {
    align-items: flex-start;
    padding-top: 5rem;
  }

  .studio-server-selector-account {
    top: 1rem;
    right: 1rem;
  }
}
```

Use Tailwind classes where already sufficient, but do not reintroduce shell/header/sidebar layout wrappers. Ensure the account indicator does not overlap the selector on mobile.

- [ ] **Step 5: Update implementation status**

Update the Studio route entry in `docs/IMPLEMENTATION_STATUS.md` to state that `/studio` is a standalone server selector with refresh and logged-in identity, while `/studio/:guildId` retains the full Studio shell. Keep the date `2026-08-13` and avoid unrelated documentation edits.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm exec vitest run apps/web/src/routes/Studio.test.tsx
```

Expected: all selector and existing Studio route tests pass.

### Task 3: Verify the complete standalone route

**Files:**
- Inspect: `apps/web/src/routes/Studio.tsx`
- Inspect: `apps/web/src/index.css`
- Inspect: `apps/web/src/routes/Studio.test.tsx`
- Inspect: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Verify active selector copy and chrome removal**

Run:

```bash
rg "Logged in as|Recent conversations|Open Studio|studio-server-selector|WorkspaceSidebar|StudioHeader" apps/web/src/routes/Studio.tsx
```

Expected: account and standalone selector hooks appear; `WorkspaceSidebar` and `StudioHeader` remain only in the guild-specific shell path; no active `Open Studio` text exists.

- [ ] **Step 2: Run focused web tests**

Run:

```bash
pnpm exec vitest run apps/web/src/routes/Studio.test.tsx apps/web/src/components/studio/StudioShell.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 3: Run workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: all workspace packages typecheck successfully.

- [ ] **Step 4: Run the web production build**

Run:

```bash
pnpm --filter @repo/web build
```

Expected: TypeScript compilation and Vite production build complete successfully.

- [ ] **Step 5: Check the final diff**

Run:

```bash
git diff --check
```

Expected: no whitespace errors; only standalone selector implementation, focused tests, CSS, and matching status/spec/plan documentation are changed by this task.
