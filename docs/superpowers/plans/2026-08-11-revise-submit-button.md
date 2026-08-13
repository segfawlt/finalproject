# Revise Submit Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the completed-plan chat composer’s labeled `Revise` submit button with a neutral circular up-arrow control.

**Architecture:** Keep the existing `ReviseInput` form and submission logic intact. Modify only its Lucide imports and submit button markup/classes so idle, loading, disabled, accessibility, and tooltip behavior remain local to the existing component.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, Vitest workspace scripts.

---

### Task 1: Replace the labeled revise control

**Files:**
- Modify: `apps/web/src/components/studio/ChatArea.tsx:1-14,498-505`

- [ ] **Step 1: Add the up-arrow icon import**

Add `ArrowUp` to the existing named import from `lucide-react`; do not add a new icon dependency or alter unrelated imports.

- [ ] **Step 2: Update the submit button presentation**

Keep `type="submit"`, `disabled={!draft.trim() || inFlight}`, and the existing submit handler unchanged. Replace the visible `Revise` text and send icon with this behavior:

```tsx
<button
  type="submit"
  disabled={!draft.trim() || inFlight}
  aria-label="Revise"
  title="Revise"
  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-shell-accent text-shell-accent-fg transition-colors hover:bg-shell-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
>
  {inFlight ? <Loader size={15} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
</button>
```

This preserves the neutral existing accent colors, keeps the button aligned with the textarea, and keeps the spinner inside the same circular hit area.

- [ ] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- apps/web/src/components/studio/ChatArea.tsx
```

Expected: only the `ArrowUp` import and the `ReviseInput` submit button markup/classes change; no form, state, or API logic changes appear.

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm typecheck
pnpm format:check
```

Expected: both commands exit successfully. If formatting reports the new JSX line, run the repository formatter only on the touched file and rerun `pnpm format:check`.

- [ ] **Step 5: Review worktree scope**

Run:

```bash
git status --short
```

Expected: the pre-existing unrelated worktree changes remain untouched; the implementation change is limited to `apps/web/src/components/studio/ChatArea.tsx`.
