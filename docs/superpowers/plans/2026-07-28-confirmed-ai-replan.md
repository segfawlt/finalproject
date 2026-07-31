# Confirmed AI Re-plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator explicitly restart planning from fresh Discord state after stale-plan conflicts, while retaining the original conversation context for the LLM.

**Architecture:** `diffEngine` reports missing desired resources as structured conflicts rather than throwing. The execute route returns an actionable stale conflict response. A new replan route creates a fresh-fork `PlanningSession` with repair context; it only emits a reviewable DesiredState and never executes Discord changes. Studio exposes this as a single confirmed action.

**Tech Stack:** TypeScript, Hono, React, Zustand, Vitest, Drizzle.

## Global Constraints

- Fresh Discord state is authoritative during repair.
- Replanning is user-confirmed and produces a new review step; it never executes automatically.
- Preserve unrelated worktree changes.
- Keep affected design/status documentation accurate.

---

### Task 1: Structured diff conflicts

**Files:** `apps/server/src/planning/diff-engine.ts`, `apps/server/src/planning/diff-engine.test.ts`

- [ ] Add `DiffConflict` and add `conflicts` to `DiffResult`.
- [ ] Test that externally deleted active channels and roles return conflicts without throwing.
- [ ] Update generation to collect missing-resource conflicts and omit unsafe steps.
- [ ] Update every caller to handle a non-empty conflict list.

### Task 2: Confirmed server-side AI replan

**Files:** `apps/server/src/hono/routes/plans.ts`, `apps/server/src/planning/planning-session.ts`

- [ ] Add a failing test for repair prompt construction using fresh state, old desired state, and conflicts.
- [ ] Permit `PlanningSession` to start from fresh state with persisted conversation history plus a repair instruction.
- [ ] Return structured stale conflicts from execute.
- [ ] Add `POST /plans/:planId/replan`, require plan/conversation access, start a fresh-fork repair session, persist a new LLM iteration, and return `202`.

### Task 3: Studio confirmation and docs

**Files:** `apps/web/src/hooks/useConversation.ts`, `apps/web/src/components/studio/ChatArea.tsx`, `docs/design/validation-and-safety.md`, `docs/IMPLEMENTATION_STATUS.md`

- [ ] Add a replan hook action that calls the route, reconnects planning SSE, and leaves execution disabled.
- [ ] Show "Re-plan with AI" only after execution conflict failure.
- [ ] Document confirmed fresh-state AI repair and implementation status.
- [ ] Run focused tests, typecheck, lint, and formatting checks.
