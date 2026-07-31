# Requirement Analysis Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Chapter 3 with measurable non-functional requirements, full specifications for all seventeen use cases, and three readable use-case diagrams.

**Architecture:** Keep Chapter 3 focused on externally observable behavior. Preserve the verified functional requirements, business rules, constraints, and legal analysis; replace only Sections 3.2–3.4 and regenerate their diagram assets. Use configured thresholds where source code defines them and label other metrics as assessment targets.

**Tech Stack:** Markdown, PlantUML, Prettier

## Global Constraints

- Modify only `docs/report/03-requirement-analysis.md`, its generated SVG assets, this plan, and learning reference counts required by `AGENTS.md`.
- Preserve targeted bot role-hierarchy validation: role position matters only for role and member-role operations.
- Preserve execution-stage Stage 1 and Stage 2 validation timing.
- Describe rollback as best-effort structural convergence; Discord requests already dispatched cannot be cancelled.
- Use the verified configured values: two-minute clarification window, 30-second step deadline, five-minute execution deadline, three retries after the initial attempt, 60-second drift interval, 30-minute lock TTL, five-minute stale-heartbeat threshold, 30-day snapshot retention, and daily snapshot cleanup.
- Defer citations, references, the test traceability matrix, introduction text, and final typesetting.
- Work in the current dirty checkout because the user explicitly asked to edit the existing report in place; do not stage or alter unrelated files.

---

### Task 1: Make all non-functional requirements measurable

**Files:**

- Modify: `docs/report/03-requirement-analysis.md`, Section 3.2

**Interfaces:**

- Consumes: NFR-1 through NFR-23 and the configured limits in Section 3.5.3.
- Produces: one acceptance criterion for every NFR, suitable for Chapter 6 test design.

- [x] **Step 1: Add an acceptance-criterion column to each NFR table**

Use direct verification conditions for safety, security, architecture, and compatibility requirements. Use the verified configured thresholds for deadlines, retries, drift, locking, and snapshot retention.

- [x] **Step 2: Label unsupported usability and performance metrics as assessment targets**

Use a local-read target of p95 at or below one second under 20 concurrent requests, and an 80% task-success target across five representative Discord administrators for the preview and natural-language tasks. Do not claim these evaluations have already passed.

- [x] **Step 3: Check NFR completeness**

Run:

```bash
for id in $(seq 1 23); do rg -q "NFR-$id" docs/report/03-requirement-analysis.md || exit 1; done
```

Expected: exit code 0.

### Task 2: Split the use-case diagram by workflow

**Files:**

- Modify: `docs/report/03-requirement-analysis.md`, Section 3.3
- Regenerate: `docs/report/03-requirement-analysis.svg`
- Generate: `docs/report/03-requirement-analysis_001.svg`
- Generate: `docs/report/03-requirement-analysis_002.svg`

**Interfaces:**

- Consumes: UC-1 through UC-17, the four actors, and the validation/drift timing notes.
- Produces: access-and-planning, approval-and-execution, and monitoring-and-management diagrams.

- [x] **Step 1: Replace the single PlantUML block with three focused blocks**

Keep approval separate from execution validation. Show clarification, cancellation, abort, rollback-on-failure, and AI repair as conditional extensions. Show the Scheduler only in drift detection.

- [x] **Step 2: Validate and regenerate all diagram assets**

Run:

```bash
env JAVA_TOOL_OPTIONS=-Djava.awt.headless=true plantuml -checkonly docs/report/03-requirement-analysis.md
env JAVA_TOOL_OPTIONS=-Djava.awt.headless=true plantuml -tsvg docs/report/03-requirement-analysis.md
```

Expected: syntax check exits 0 and three SVG files are generated.

### Task 3: Standardize all seventeen use-case specifications

**Files:**

- Modify: `docs/report/03-requirement-analysis.md`, Section 3.4

**Interfaces:**

- Consumes: FR-1 through FR-28, UC-1 through UC-17, the actor definitions, and Sections 3.5–3.6.
- Produces: a complete specification for each numbered use case with actors, requirements, preconditions, trigger, main flow, alternatives/exceptions, and postconditions.

- [x] **Step 1: Replace the tiered specification structure**

Remove the distinction between core, condensed, and summarized use cases. State that use cases are normative requirements whose implementation coverage is evaluated in Chapter 6.

- [x] **Step 2: Write UC-1 through UC-8 in the standard format**

Cover authentication, server selection, planning, preview, revision, manual editing, templates, and iteration reversion without exposing internal implementation details unnecessarily.

- [x] **Step 3: Write UC-9 through UC-17 in the standard format**

Preserve stale-state rejection, execution-stage validation, best-effort rollback, intended plan history, drift repair, rules/templates, planning cancellation, and execution abort semantics.

- [x] **Step 4: Check use-case completeness and uniqueness**

Run:

```bash
for id in $(seq 1 17); do test "$(rg -c "^\\*\\*UC-$id —" docs/report/03-requirement-analysis.md)" -eq 1 || exit 1; done
```

Expected: exit code 0.

### Task 4: Verify the completed chapter

**Files:**

- Check: `docs/report/03-requirement-analysis.md`
- Check: `docs/report/03-requirement-analysis.svg`
- Check: `docs/report/03-requirement-analysis_001.svg`
- Check: `docs/report/03-requirement-analysis_002.svg`

**Interfaces:**

- Consumes: all deliverables from Tasks 1–3.
- Produces: verified evidence that the chapter is formatted, internally consistent, and ready to support Chapters 4 and 6.

- [x] **Step 1: Format and syntax-check the chapter**

Run:

```bash
pnpm exec prettier --write docs/report/03-requirement-analysis.md docs/superpowers/plans/2026-07-28-requirement-analysis-completion.md
pnpm exec prettier --check docs/report/03-requirement-analysis.md docs/superpowers/plans/2026-07-28-requirement-analysis-completion.md
env JAVA_TOOL_OPTIONS=-Djava.awt.headless=true plantuml -checkonly docs/report/03-requirement-analysis.md
git diff --check -- docs/report/03-requirement-analysis.md docs/superpowers/plans/2026-07-28-requirement-analysis-completion.md
```

Expected: all commands exit 0.

- [x] **Step 2: Search for superseded claims**

Search for a global highest-role requirement, validation during approval, transactional rollback, cancellable Discord requests, and a single-diagram description. Expected: no superseded claim remains.

- [x] **Step 3: Inspect the generated diagrams**

Confirm that all three SVG files are non-empty and contain the expected workflow names; render raster previews if visual inspection is necessary.
