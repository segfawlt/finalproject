# Template Library And Studio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make template browsing and authoring visually consistent with Studio, without showing conversation history on template routes.

**Architecture:** Keep the existing template routes and API lifecycle. Add a template-specific mode to the shared workspace sidebar, return the existing template structure and timestamp in the list response for card metadata, and reshape only route-level presentation. The existing Template Studio draft guard remains the only mechanism that may save, discard, or preserve local structure edits before state-changing actions.

**Tech Stack:** React, TypeScript, React Router, Tailwind CSS, Zustand, Hono, Drizzle, Vitest, Testing Library.

---

## File Structure

- `apps/web/src/components/studio/StudioShell.tsx`: symmetric panel toggle placement.
- `apps/web/src/components/studio/StudioShell.test.tsx`: verifies independent panel behavior and edge-position classes.
- `apps/web/src/components/studio/WorkspaceSidebar.tsx`: adds a template-only navigation mode that suppresses conversation fetching and rendering.
- `apps/web/src/components/studio/WorkspaceSidebar.test.tsx`: verifies template mode has no conversation request or section.
- `apps/server/src/hono/routes/templates.ts`: list creator-owned template metadata sufficient for library structure counts.
- `apps/server/src/hono/routes/templates.test.ts`: locks the list response contract.
- `apps/web/src/routes/Templates.tsx`: responsive library card grid with descriptions, structure stats, version, and updated date.
- `apps/web/src/routes/Templates.test.tsx`: verifies library metadata and canonical card links.
- `apps/web/src/routes/TemplateViewer.tsx`: presents a template description below the title.
- `apps/web/src/routes/TemplateViewer.test.tsx`: verifies description rendering.
- `apps/web/src/routes/TemplateStudio.tsx`: Studio-style three-column template authoring layout, while retaining draft safeguards.
- `apps/web/src/routes/TemplateStudio.test.tsx`: verifies authoring composition and guarded navigation.
- `docs/IMPLEMENTATION_STATUS.md`: updates the template route/component descriptions and test inventory.

### Task 1: Align Shared Panel Toggles

**Files:**
- Modify: `apps/web/src/components/studio/StudioShell.tsx:97-120,130-153`
- Modify: `apps/web/src/components/studio/StudioShell.test.tsx:24-70`

- [ ] **Step 1: Write the failing edge-placement test**

Add assertions that examine the close and reopen controls after rendering both side panels:

```tsx
expect(screen.getByRole("button", { name: "Close navigation" })).toHaveClass("left-0");
expect(screen.getByRole("button", { name: "Close preview" })).toHaveClass("right-0");

await user.click(screen.getByRole("button", { name: "Close navigation" }));
await user.click(screen.getByRole("button", { name: "Close preview" }));

expect(screen.getByRole("button", { name: "Open navigation" })).toHaveClass("left-0");
expect(screen.getByRole("button", { name: "Open preview" })).toHaveClass("right-0");
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx`

Expected: FAIL because visible controls use negative inner-edge offsets.

- [ ] **Step 3: Move visible panel controls to the outer edges**

Replace the visible-control class strings so each control is centered on its panel's outer edge and uses the same shape as its restore control:

```tsx
className="pointer-events-auto absolute -left-3 top-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-shell-border bg-shell-surface text-shell-text-muted shadow-sm hover:bg-shell-surface2 hover:text-shell-text"
```

for the left visible control, and:

```tsx
className="pointer-events-auto absolute -right-3 top-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-shell-border bg-shell-surface text-shell-text-muted shadow-sm hover:bg-shell-surface2 hover:text-shell-text"
```

for the right visible control. Keep the existing `left-0` and `right-0` restore controls and all accessibility labels unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add apps/web/src/components/studio/StudioShell.tsx apps/web/src/components/studio/StudioShell.test.tsx
git commit -m "fix(web): align studio panel controls"
```

### Task 2: Add Template Sidebar Mode

**Files:**
- Modify: `apps/web/src/components/studio/WorkspaceSidebar.tsx:9-183`
- Modify: `apps/web/src/components/studio/WorkspaceSidebar.test.tsx:27-125`

- [ ] **Step 1: Write the failing template-mode test**

Add a test rendering template mode with contextual content:

```tsx
it("does not fetch or render conversations in template mode", () => {
  render(
    <MemoryRouter initialEntries={["/templates/one/studio"]}>
      <WorkspaceSidebar guildId={null} guildName={null} mode="templates" contextTitle="Version history">
        <div>version history</div>
      </WorkspaceSidebar>
    </MemoryRouter>
  );

  expect(apiFetch).not.toHaveBeenCalled();
  expect(screen.queryByText("Recent conversations")).toBeNull();
  expect(screen.getByText("version history")).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components/studio/WorkspaceSidebar.test.tsx`

Expected: FAIL because `mode` is not a prop and the no-guild empty conversation state renders.

- [ ] **Step 3: Implement the explicit mode boundary**

Add `mode?: "studio" | "templates"` to `WorkspaceSidebarProps`, default it to `"studio"`, and condition both the conversation-fetching effect and conversation-section JSX on `mode === "studio"`. Preserve navigation, retained-guild New chat behavior, contextual children, and account footer in either mode.

```tsx
const showConversations = mode === "studio";

useEffect(() => {
  if (!showConversations || !guildId) {
    setConversations([]);
    return;
  }
  // existing request
}, [guildId, showConversations]);
```

Pass `mode="templates"` from `Templates.tsx`, `TemplateViewer.tsx`, and `TemplateStudio.tsx`.

- [ ] **Step 4: Run the focused component and route tests**

Run: `pnpm exec vitest run apps/web/src/components/studio/WorkspaceSidebar.test.tsx apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the focused change**

```bash
git add apps/web/src/components/studio/WorkspaceSidebar.tsx apps/web/src/components/studio/WorkspaceSidebar.test.tsx apps/web/src/routes/Templates.tsx apps/web/src/routes/TemplateViewer.tsx apps/web/src/routes/TemplateStudio.tsx
git commit -m "fix(web): hide conversations on template routes"
```

### Task 3: Supply And Render Library Metadata

**Files:**
- Modify: `apps/server/src/hono/routes/templates.test.ts:163-168`
- Modify: `apps/server/src/hono/routes/templates.ts:103-117`
- Modify: `apps/web/src/routes/Templates.test.tsx:24-79`
- Modify: `apps/web/src/routes/Templates.tsx:9-141`
- Modify: `apps/web/src/routes/TemplateViewer.test.tsx:43-55`
- Modify: `apps/web/src/routes/TemplateViewer.tsx:10-119`

- [ ] **Step 1: Write the failing API contract test**

Seed an owned template with `description`, `structure`, and `updatedAt`, then assert that `GET /templates` preserves all three fields:

```ts
state.templates = [{
  id: "owned",
  authorId: "user-1",
  description: "A moderated community",
  structure: { channels: { general: {} }, roles: { member: {} } },
  updatedAt: "2026-08-12T00:00:00.000Z",
}];

const response = await makeApp().request("/templates");
expect(await response.json()).toEqual(state.templates);
```

- [ ] **Step 2: Run the route test to establish the current behavior**

Run: `pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts`

Expected: PASS if the existing raw list already preserves these columns. Do not alter the endpoint if the test confirms the contract; the test is the regression boundary.

- [ ] **Step 3: Write failing library and viewer assertions**

Extend the web fixture with `structure` and `updatedAt`, then assert:

```tsx
expect(await screen.findByText("2 channels")).toBeVisible();
expect(screen.getByText("1 role")).toBeVisible();
expect(screen.getByText("A helpful server")).toBeVisible();
expect(screen.getByText(/Updated Aug 12, 2026/)).toBeVisible();
```

For the viewer test, assert the description is displayed beneath the template heading.

- [ ] **Step 4: Run web route tests to verify they fail**

Run: `pnpm exec vitest run apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx`

Expected: FAIL because summary structures and update dates are not rendered.

- [ ] **Step 5: Implement summary shape and responsive cards**

Extend `TemplateSummary` with:

```ts
structure: Record<string, unknown>;
updatedAt: string;
```

Use a local `structureCounts` function that treats `structure.channels` and `structure.roles` as records and returns their `Object.keys` lengths. Replace the `<ul className="space-y-2">` with:

```tsx
<ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
```

Render a fixed-height card with title, version, description, optional category/tags, counts, and a formatted update date. Keep each card as the canonical viewer link and retain search behavior. Add `description` to `TemplateViewer`'s detail interface and render it only when non-empty below the `<h1>`.

- [ ] **Step 6: Run API and web tests**

Run: `pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the focused change**

```bash
git add apps/server/src/hono/routes/templates.test.ts apps/web/src/routes/Templates.tsx apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.tsx apps/web/src/routes/TemplateViewer.test.tsx
git commit -m "feat(web): improve template library cards"
```

### Task 4: Reshape Template Studio Authoring

**Files:**
- Create: `apps/web/src/routes/TemplateStudio.test.tsx`
- Modify: `apps/web/src/routes/TemplateStudio.tsx:1-374`
- Modify: `docs/IMPLEMENTATION_STATUS.md:116-119,177-180,223-229,257`

- [ ] **Step 1: Write the failing route composition test**

Mock the template, versions, and authoring-turn endpoint responses. Verify the template route has no recent conversation heading, shows version history, renders the persisted prompt as a user-style turn, renders its summary as an assistant-style result, and exposes the docked authoring composer:

```tsx
expect(await screen.findByText("Version history")).toBeVisible();
expect(screen.queryByText("Recent conversations")).toBeNull();
expect(screen.getByText("Add a welcome channel")).toBeVisible();
expect(screen.getByText("Added a welcome channel.")).toBeVisible();
expect(screen.getByPlaceholderText("Describe a template change…")).toBeVisible();
```

Add a dirty-draft test that clicks the viewer back link after `onDirtyChange(true)` and verifies the Save/Discard/Stay dialog remains present before navigation.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/TemplateStudio.test.tsx`

Expected: FAIL because no route test exists and the current center pane is a plain scrollable list with an inline form.

- [ ] **Step 3: Replace the center pane with Studio-style authoring presentation**

Keep all existing state, API calls, `guarded`, `saveAndContinue`, and `discardAndContinue` functions. In the central pane:

- Render authoring turns as a right-aligned accent prompt bubble followed by a left-aligned assistant result card containing status and summary/error.
- Render active tool events in a collapsed `<details>` activity log inside the active assistant card.
- Render `authoring.question` as a bordered question card with the existing answer behavior.
- Place the submit form in an absolute bottom gradient with a rounded, shadowed composer shell, a textarea, an `Author` submit control, and active cancellation.
- Reserve bottom padding in the scroll viewport so the composer never obscures turns.

Use the same `shell-*`, `agent-*`, border-radius, and shadow vocabulary as `ChatArea.tsx`. Do not import `SharedComposer`, because it is private to server Studio and requires model-selector props that template authoring does not use.

- [ ] **Step 4: Simplify the contextual header without changing semantics**

Keep the header’s controls and callbacks, but style them as compact Studio actions. Show the current version beside the editable description; preserve accessible labels `Back to viewer`, `Save metadata`, `Fork template`, and `Delete template`. Retain the header duplicate needed by StudioShell’s `header` function and the central shell for normal narrow/mobile layout unless the component is refactored to a single shared header without changing DOM behavior.

- [ ] **Step 5: Run focused Template Studio tests**

Run: `pnpm exec vitest run apps/web/src/routes/TemplateStudio.test.tsx apps/web/src/hooks/useTemplateAuthoring.test.ts apps/web/src/components/template-studio/TemplatePreview.test.tsx`

Expected: PASS.

- [ ] **Step 6: Update implementation status documentation**

Update the existing Template Library/viewer and Template Studio entries to describe responsive metadata cards, template-mode navigation with no conversation history, and Studio-style authoring. Update the tests section with `TemplateStudio.test.tsx`, and add a concise Recently resolved entry for the template UI refinement. Keep the date `2026-08-12`.

- [ ] **Step 7: Run formatting and all affected web tests**

Run: `pnpm exec prettier --write apps/web/src/components/studio/StudioShell.tsx apps/web/src/components/studio/StudioShell.test.tsx apps/web/src/components/studio/WorkspaceSidebar.tsx apps/web/src/components/studio/WorkspaceSidebar.test.tsx apps/web/src/routes/Templates.tsx apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.tsx apps/web/src/routes/TemplateViewer.test.tsx apps/web/src/routes/TemplateStudio.tsx apps/web/src/routes/TemplateStudio.test.tsx docs/IMPLEMENTATION_STATUS.md`

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx apps/web/src/components/studio/WorkspaceSidebar.test.tsx apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx apps/web/src/routes/TemplateStudio.test.tsx apps/web/src/hooks/useTemplateAuthoring.test.ts apps/web/src/components/template-studio/TemplatePreview.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the focused change**

```bash
git add apps/web/src/routes/TemplateStudio.tsx apps/web/src/routes/TemplateStudio.test.tsx docs/IMPLEMENTATION_STATUS.md
git commit -m "feat(web): align template studio with workspace"
```

### Task 5: Full Verification

**Files:**
- Verify: all files above

- [ ] **Step 1: Typecheck the monorepo**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Run all tests once**

Run: `pnpm test:run`

Expected: PASS. If server environment validation blocks the suite, run `dotenv -e .env -- pnpm test:run` as documented in `docs/learnings/test-failures/load-env-for-vitest-server-suites.md`.

- [ ] **Step 3: Check formatting**

Run: `pnpm format:check`

Expected: PASS.

- [ ] **Step 4: Inspect the completed diff**

Run: `git diff --check`

Expected: no whitespace errors.

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover panel placement, template-only navigation, library descriptions and stats, viewer descriptions, Template Studio authoring layout, draft safety, and status documentation. Task 5 verifies the integrated result.
- Placeholder scan: no TODO/TBD or vague test steps remain; every test target, behavior, and command is explicit.
- Type consistency: `mode="templates"` is introduced in Task 2 and used consistently by all template routes. List metadata uses the existing `structure` and `updatedAt` template fields throughout.
