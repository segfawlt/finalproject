# Project Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone 15-slide HTML/CSS presentation that explains the project's plan-first Discord-management architecture before a live demo.

**Architecture:** A single static document contains the slide markup, visual theme, CSS diagrams, and minimal keyboard/click navigation. Presentation content follows the approved engineering narrative, emphasizing declarative planning, deterministic diffing, safety validation, controlled execution, drift, and quality evidence.

**Tech Stack:** HTML5, CSS3, vanilla JavaScript.

---

## File Structure

- Create: `docs/presentation/index.html` — self-contained presentation with all content, styles, diagrams, and navigation.
- Create: `docs/presentation/README.md` — local viewing and keyboard-control instructions.
- Modify: `docs/IMPLEMENTATION_STATUS.md` — add the presentation artifact to the documentation inventory and update its date.

### Task 1: Create the Presentation Deck

**Files:**
- Create: `docs/presentation/index.html`

- [ ] **Step 1: Create a self-contained 15-slide document**

Implement one `<section class="slide">` per approved outline item. Add a heading and short supporting content for: problem, direct-AI risk, plan-first flow, DesiredState, architecture, planning, diffing, validation, fail-closed policy, execution/recovery, drift, supporting workflows, engineering quality, and demo handoff.

- [ ] **Step 2: Add the visual system and CSS diagrams**

Use a dark technical theme with clear typography, high contrast, limited accent colors, a slide-number indicator, and simple CSS-only diagrams. Render the end-to-end pipeline, architecture layers, validation boundary, and execution safeguards as visual systems rather than dense prose.

- [ ] **Step 3: Add presentation navigation**

Add JavaScript that tracks the active slide, reacts to `ArrowRight`, `ArrowLeft`, `Space`, `PageUp`, `PageDown`, `Home`, and `End`, and supports previous/next buttons. Navigation must remain clamped between slide 1 and slide 15 and update the page title and progress indicator.

- [ ] **Step 4: Verify the slide count and content**

Run:

```bash
rg -c '<section class="slide' docs/presentation/index.html
```

Expected: `15`.

- [ ] **Step 5: Commit**

```bash
git add docs/presentation/index.html
```

### Task 2: Document Use and Project Status

**Files:**
- Create: `docs/presentation/README.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md:3,287-293`

- [ ] **Step 1: Add deck usage instructions**

Document opening `docs/presentation/index.html` directly in a browser, the supported navigation keys, and the intended use: a 10-minute engineering presentation preceding a separate live demo.

- [ ] **Step 2: Update the implementation-status document**

Set the date to `2026-08-13` if not already current and add a concise Documentation entry stating that `docs/presentation/index.html` is a standalone 15-slide technical/academic project presentation focused on plan-first architecture and the live-demo handoff.

- [ ] **Step 3: Verify documentation links and status**

Run:

```bash
rg -n "Project Presentation|ArrowRight|15-slide" docs/presentation docs/IMPLEMENTATION_STATUS.md
```

Expected: matches in both the README/deck and implementation status.

- [ ] **Step 4: Commit**

```bash
git add docs/presentation/README.md docs/IMPLEMENTATION_STATUS.md
```

### Task 3: Final Static Verification

**Files:**
- Verify: `docs/presentation/index.html`
- Verify: `docs/presentation/README.md`
- Verify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Confirm all intended slide headings exist**

Run:

```bash
rg -n "Why this problem matters|Why direct AI editing fails|Plan before execution|Engineering quality|Live demo" docs/presentation/index.html
```

Expected: each heading is present.

- [ ] **Step 2: Check the worktree changes**

Run:

```bash
git diff --check
```

Expected: no whitespace errors; existing unrelated worktree changes remain untouched.

- [ ] **Step 3: Commit only presentation files if the final verification changed them**

```bash
git add docs/presentation/index.html docs/presentation/README.md docs/IMPLEMENTATION_STATUS.md
```

Skip this step if there are no uncommitted changes in these files.

## Self-Review

- Spec coverage: Task 1 implements all 15 approved slides, static visual treatment, and deck navigation. Task 2 documents use and records the artifact in project status. Task 3 validates the final structure and hygiene.
- Placeholder scan: no placeholders or deferred implementation directions remain.
- Consistency: the deck location is consistently `docs/presentation/index.html`; all content supports the approved plan-first narrative and separate live-demo handoff.
