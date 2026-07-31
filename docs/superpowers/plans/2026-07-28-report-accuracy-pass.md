# Report Accuracy Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the existing Requirement Analysis and System Design drafts so they accurately distinguish intended requirements from verified implementation behavior.

**Architecture:** This is a report-only pass. Chapter 3 remains an external specification, while implementation-sensitive explanations and Chapter 4 describe current behavior and explicitly identify limitations. The embedded PlantUML source and generated SVG remain synchronized.

**Tech Stack:** Markdown, PlantUML

## Global Constraints

- Do not modify application source code or write the Testing and Evaluation chapter.
- Retain UK GDPR and the BCS Code of Conduct as the legal/professional frameworks.
- Defer numbered IEEE citations, the bibliography, introduction, and front matter.
- Preserve intended requirements such as plan history while avoiding unsupported claims that they are currently user-visible.

---

### Task 1: Correct requirements, use cases, and business rules

**Files:**

- Modify: `docs/report/03-requirement-analysis.md`
- Regenerate: `docs/report/03-requirement-analysis.svg`

- [x] Clarify that `Administrator` is the global operability requirement and role hierarchy is checked only for role/member-role operations.
- [x] Correct policy-validation timing: server rules are evaluated by Stage 2 during pre-execution validation, not injected into the ordinary planning prompt.
- [x] Correct the use-case diagram relationships and drift-recovery terminology.
- [x] Preserve plan history and drift recovery as requirements without claiming unverified UI completion.
- [x] Regenerate the SVG with `plantuml -tsvg docs/report/03-requirement-analysis.md` and verify the output renders.

### Task 2: Strengthen legal, ethical, and auditability analysis

**Files:**

- Modify: `docs/report/03-requirement-analysis.md`

- [x] Expand the personal-data inventory to include ordinary guild members represented in prompts and desired-state records.
- [x] Explain third-party LLM processing, lawful-basis limits, transparency, retention, erasure, and international-transfer risks under UK GDPR.
- [x] Narrow auditability claims to the plan owner/approver and execution timestamps actually recorded.
- [x] State that in-flight Discord operations cannot be cancelled and that rollback is best-effort structural convergence.

### Task 3: Correct current System Design claims

**Files:**

- Modify: `docs/report/04-design.md`

- [x] Describe the `ExecuteContext` seam narrowly and accurately.
- [x] Correct the stale-state, policy-validation, rollback, and testing descriptions.
- [x] Avoid adding the still-unwritten detailed-design sections in this accuracy pass.

### Task 4: Verify report consistency

**Files:**

- Check: `docs/report/03-requirement-analysis.md`
- Check: `docs/report/04-design.md`
- Check: `docs/report/03-requirement-analysis.svg`

- [x] Search for superseded claims about global highest-role gating, rules in the planning prompt, approval calling the LLM, mandatory refresh, exact actor-level execution auditing, and cancellable Discord operations.
- [x] Run `pnpm exec prettier --check docs/report/03-requirement-analysis.md docs/report/04-design.md`.
- [x] Run PlantUML syntax validation and inspect the generated SVG dimensions/content.
