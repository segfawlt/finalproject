# Studio UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify Studio's fresh-chat and guild-picker copy, and remove unused Templates and sidebar visibility controls.

**Architecture:** Keep the existing Studio layout, panel sizing store, guild-list API, and Templates tab unchanged. Update only the components that render the obsolete controls and copy, with focused tests that prove visible behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, Zustand, Vitest, Testing Library.

---

## File Structure

- Modify `apps/web/src/components/studio/ChatArea.tsx` to render the guild-independent fresh-chat greeting and supporting line.
- Create `apps/web/src/components/studio/ChatArea.test.tsx` to test fresh-chat copy at each greeting boundary.
- Modify `apps/web/src/routes/Studio.tsx` to format prior guild activity as a localized time and remove template-panel header wiring.
- Create `apps/web/src/routes/Studio.test.tsx` to test guild-card recency output with mocked route dependencies.
- Modify `apps/web/src/components/studio/StudioHeader.tsx` to remove the obsolete Templates button interface and rendering.
- Modify `apps/web/src/components/studio/StudioHeader.test.tsx` to assert the header does not render the removed control.
- Modify `apps/web/src/components/studio/StudioShell.tsx` to retain both panels and their separators without hide/show controls.
- Modify `apps/web/src/components/studio/StudioShell.test.tsx` to retain resize coverage and remove visibility-toggle expectations.
- Modify `docs/IMPLEMENTATION_STATUS.md` so its Studio component description matches the non-collapsible shell and Templates-tab-only access.

### Task 1: Fresh-chat greeting

**Files:**

- Modify: `apps/web/src/components/studio/ChatArea.tsx:40-287`
- Create: `apps/web/src/components/studio/ChatArea.test.tsx`

- [ ] **Step 1: Write the failing greeting test**

Create `ChatArea.test.tsx`. Test the pure greeting helper through a named export:

```tsx
import { describe, expect, it } from "vitest";
import { timeGreeting } from "./ChatArea";

describe("timeGreeting", () => {
  it("uses morning, afternoon, and evening boundaries", () => {
    expect(timeGreeting(new Date("2026-08-12T11:59:00"))).toBe("Good morning");
    expect(timeGreeting(new Date("2026-08-12T12:00:00"))).toBe("Good afternoon");
    expect(timeGreeting(new Date("2026-08-12T18:00:00"))).toBe("Good evening");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components/studio/ChatArea.test.tsx`

Expected: FAIL because `timeGreeting` is not exported.

- [ ] **Step 3: Implement the minimal greeting change**

Change `FreshChat` so it no longer accepts `guildName`, render the greeting and a neutral supporting line, and export the existing helper:

```tsx
function FreshChat({
  c,
  onSubmit,
}: {
  c: UseConversationResult;
  onSubmit: (prompt?: string) => Promise<void>;
}) {
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-32 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-shell-text">{timeGreeting()}</h1>
        <p className="mt-2 text-sm text-shell-text-muted">What would you like to plan?</p>
      </div>
      {/* Keep the existing SharedComposer unchanged. */}
    </div>
  );
}

export function timeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
```

Remove `guildName` from `ChatAreaProps`, `ChatArea`, and the `FreshChat` call, then remove the corresponding `guildName` prop from `Studio.tsx`.

- [ ] **Step 4: Add a rendering assertion for the guild-independent copy**

Add a `FreshChat` rendering test using the same minimal mocked conversation result. Assert the greeting's supporting line is visible and no supplied guild name appears:

```tsx
expect(screen.getByText("What would you like to plan?")).toBeVisible();
expect(screen.queryByText("Design Guild", { exact: false })).not.toBeInTheDocument();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run apps/web/src/components/studio/ChatArea.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the greeting change**

```bash
git add apps/web/src/components/studio/ChatArea.tsx apps/web/src/components/studio/ChatArea.test.tsx apps/web/src/routes/Studio.tsx
git commit -m "fix(web): simplify fresh chat greeting"
```

### Task 2: Guild recency copy

**Files:**

- Modify: `apps/web/src/routes/Studio.tsx:29-80,208-237`
- Create: `apps/web/src/routes/Studio.test.tsx`

- [ ] **Step 1: Write the failing guild-card test**

Mock `apiFetch` to return a guild with `latestConversation: { prompt: "Old prompt", updatedAt: "2026-08-12T14:30:00" }`, mock Studio children, and render `Studio` at `/studio`. Assert the card renders the label and localized time but not the prompt:

```tsx
expect(await screen.findByText(/Last conversation at:/)).toHaveTextContent(
  `Last conversation at: ${new Date("2026-08-12T14:30:00").toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`
);
expect(screen.queryByText("Old prompt")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/routes/Studio.test.tsx`

Expected: FAIL because the card displays the prompt and date separately.

- [ ] **Step 3: Implement minimal guild-card copy**

Replace the two latest-conversation branches in the guild card with one secondary line:

```tsx
<span className="block truncate text-xs text-shell-text-muted">
  {g.latestConversation
    ? `Last conversation at: ${new Date(g.latestConversation.updatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : `${g.memberCount} members`}
</span>
```

Remove the trailing date `<span>` entirely. Keep `latestConversation.prompt` in the response type because the API contract is unchanged and it may be consumed elsewhere later.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/routes/Studio.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the guild-card change**

```bash
git add apps/web/src/routes/Studio.tsx apps/web/src/routes/Studio.test.tsx
git commit -m "fix(web): clarify guild conversation recency"
```

### Task 3: Remove the Templates header control

**Files:**

- Modify: `apps/web/src/components/studio/StudioHeader.tsx:1-24,53-67`
- Modify: `apps/web/src/components/studio/StudioHeader.test.tsx`
- Modify: `apps/web/src/routes/Studio.tsx:134-143`

- [ ] **Step 1: Write the failing header test**

Replace the current irrelevant assertions with a direct behavior test:

```tsx
it("does not render a Templates header control", () => {
  render(
    <MemoryRouter initialEntries={["/studio/guild-1"]}>
      <StudioHeader templatesOpen templateCount={2} onToggleTemplates={() => undefined} />
    </MemoryRouter>
  );

  expect(screen.queryByRole("button", { name: /templates/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioHeader.test.tsx`

Expected: FAIL because the button currently renders when `onToggleTemplates` is supplied.

- [ ] **Step 3: Remove the obsolete interface and wiring**

In `StudioHeader.tsx`, remove the `FileText` import; remove `templatesOpen`, `onToggleTemplates`, and `templateCount` from the function arguments and type; and remove the Templates button block. In `Studio.tsx`, stop passing those three props to `StudioHeader`. Leave `TemplatePanel` and `c.showTemplatePanel` intact because template context is still managed by existing template UI.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the header cleanup**

```bash
git add apps/web/src/components/studio/StudioHeader.tsx apps/web/src/components/studio/StudioHeader.test.tsx apps/web/src/routes/Studio.tsx
git commit -m "fix(web): remove unused templates header button"
```

### Task 4: Remove sidebar visibility controls

**Files:**

- Modify: `apps/web/src/components/studio/StudioShell.tsx:1-24,84-155`
- Modify: `apps/web/src/components/studio/StudioShell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

Replace the hide/show tests with a test that proves panels and separators remain while visibility controls are absent:

```tsx
it("renders both resizable panels without visibility controls", () => {
  render(
    <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
      <div>chat</div>
    </StudioShell>
  );

  expect(screen.getByText("navigation")).toBeVisible();
  expect(screen.getByText("preview")).toBeVisible();
  expect(screen.getByRole("separator", { name: "Resize navigation" })).toBeVisible();
  expect(screen.getByRole("separator", { name: "Resize preview" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /navigation|preview/i })).not.toBeInTheDocument();
});
```

Remove the obsolete tests that click Close/Open navigation or preview. Retain separator double-click and keyboard/pointer resizing tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx`

Expected: FAIL because Close navigation and Close preview controls render.

- [ ] **Step 3: Remove visibility-control code**

In `StudioShell.tsx`, remove the Lucide chevron import and the `leftVisible`, `rightVisible`, `toggleLeft`, and `toggleRight` store selectors. Render both `<aside>` elements directly whenever their content prop exists, retaining their desktop/mobile width classes and separators. Delete the four control render blocks for Close/Open navigation and preview. Do not change the width and reset store actions; the obsolete visibility values may remain persisted for compatibility but must no longer affect rendering.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shell cleanup**

```bash
git add apps/web/src/components/studio/StudioShell.tsx apps/web/src/components/studio/StudioShell.test.tsx
git commit -m "fix(web): remove studio sidebar visibility controls"
```

### Task 5: Synchronize documentation and verify

**Files:**

- Modify: `docs/IMPLEMENTATION_STATUS.md:144-160`

- [ ] **Step 1: Update implementation status**

Replace the `StudioShell` status description with:

```markdown
- `done` StudioShell — 3-column grid (header | sidebar | chat | rightPanel) with independently persisted, clamped resizable panels, keyboard/pointer resizing, reset, and mobile layouts
```

Update the `StudioHeader` description to omit Templates toggling, and update the `Studio` route description to describe time-based fresh-chat copy and localized last-conversation time in the guild picker.

- [ ] **Step 2: Run focused web tests**

Run: `pnpm exec vitest run apps/web/src/components/studio/ChatArea.test.tsx apps/web/src/routes/Studio.test.tsx apps/web/src/components/studio/StudioHeader.test.tsx apps/web/src/components/studio/StudioShell.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run static verification**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Commit documentation and final verification state**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: update studio cleanup status"
```
