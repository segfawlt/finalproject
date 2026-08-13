# Studio Chatbar Border Beam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dependency-free white traveling beam around the Studio chatbar while planning is active, stopping when planning reaches a terminal phase.

**Architecture:** Create a small local `BorderBeam` component under the shadcn-compatible `components/ui` path. It renders a wrapper with CSS pseudo-elements and an `active` prop, while `ChatArea` derives activity from the existing conversation phase and wraps the existing composer form without changing conversation state.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, CSS custom properties, Vitest/jsdom.

---

### Task 1: Add the local BorderBeam primitive

**Files:**
- Create: `apps/web/src/components/ui/border-beam.tsx`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Create the typed component API**

Implement `BorderBeam` with `children`, `active`, `duration`, `borderRadius`, `className`, and `style` props. The wrapper must be `position: relative`, preserve child layout, and expose `data-border-beam-active` for CSS. Use a white traveling conic-gradient masked to the border, plus a restrained glow. Forward standard `HTMLDivElement` attributes.

- [ ] **Step 2: Add the animation CSS**

Add a uniquely prefixed `@property` angle and keyframes in `apps/web/src/index.css`. Animate only when the wrapper has `data-border-beam-active="true"`; inactive state must fade the beam and glow to opacity zero. Add `prefers-reduced-motion: reduce` rules that disable movement while retaining no distracting glow.

- [ ] **Step 3: Verify the primitive typechecks**

Run `pnpm --filter @repo/web typecheck`.

Expected: TypeScript completes successfully.

### Task 2: Integrate the beam with the Studio composer

**Files:**
- Modify: `apps/web/src/components/studio/ChatArea.tsx:1-16,457-524`

- [ ] **Step 1: Import the local primitive**

Import `BorderBeam` from `../ui/border-beam`.

- [ ] **Step 2: Add the phase-based active state**

Extend `SharedComposer` with an `active?: boolean` prop. Pass `active={c.phase === "planning" || c.phase === "ask_user"}` from both fresh and revise composer call sites. This keeps the beam active during the full planning stream and user-question pause, and inactive for input, completed, executing, executed, and execute-failed phases.

- [ ] **Step 3: Wrap only the existing form**

Replace the form’s direct rendering with:

```tsx
<BorderBeam active={active} duration={2.2} borderRadius={24}>
  <form className="...existing classes...">...</form>
</BorderBeam>
```

Keep the form controls, submit behavior, disabled state, and responsive width unchanged. Remove any outer border that would create a duplicate outline; retain the form’s subtle inset edge and shadow.

### Task 3: Add focused regression coverage

**Files:**
- Modify: `apps/web/src/components/studio/ChatArea.test.tsx`

- [ ] **Step 1: Add a render test for active state**

Mock `ModelSelector`, render `ChatArea` with the minimum `UseConversationResult` fixture for a fresh composer, and assert the wrapper exposes `data-border-beam-active="false"` in the input phase and `"true"` in the planning phase.

- [ ] **Step 2: Run the focused test**

Run `pnpm exec vitest run apps/web/src/components/studio/ChatArea.test.tsx`.

Expected: all ChatArea tests pass.

### Task 4: Update implementation status and verify the workspace

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Document the component and integration**

Add the `components/ui/border-beam.tsx` primitive and the phase-driven ChatArea composer beam to the existing web component/status entries without changing unrelated status lines.

- [ ] **Step 2: Run final checks**

Run:

```bash
pnpm --filter @repo/web typecheck
pnpm exec vitest run apps/web/src/components/studio/ChatArea.test.tsx
pnpm --filter @repo/web build
```

Expected: typecheck, focused tests, and the production build all pass.
