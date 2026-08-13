---
name: plan-driven-subagent-orchestration
description: Use when the user asks to implement an approved, detailed task-structured plan file or explicitly requests worker-led implementation. Orchestrates bounded Luna executor work while the primary agent retains review and integration ownership.
---

# Plan-Driven Subagent Orchestration

**Core principle:** The primary agent owns understanding, judgment, integration, and completion; Luna executors perform only bounded, well-contextualized implementation or validation assignments.

## Trigger

Use this skill only when the user explicitly requests implementation of an approved, detailed, task-structured plan file or explicitly requests worker-led implementation. Do **not** activate merely because a plan file exists, even when workers are generally preferred. Ordinary requests use normal primary-agent judgment. Other applicable process skills remain required.

## Primary Agent Responsibilities

1. Read the approved plan once. Extract each task's complete text, dependencies, allowed files, acceptance criteria, and focused checks; do not send workers a plan path instead of context.
2. Verify that the current worktree still matches the plan's assumptions and that the requested work is applicable.
3. Keep architecture-heavy, ambiguous, security-sensitive, tightly coupled, and broad debugging work in the primary agent. Create task state and track dependencies and ownership.
4. Label every assignment exactly as `implementation` or `validation`.
5. Review every result and the actual diff. Own integration, broad checks, diagnosis, fixes, and final completion.

## Executor Assignment Contract

An `implementation` assignment must be bounded, established-pattern based, and include:

- complete task text and relevant context;
- scope and explicitly allowed files;
- dependencies and applicable existing patterns;
- acceptance criteria;
- focused checks to run;
- restrictions and expected report format.

A `validation` assignment is command-only: provide the exact commands and requested result format, with no implementation authority. Executors cannot own architecture, integration, or overall completion.

## Parallelism

Parallelize only when file ownership and artifacts are genuinely disjoint, including migrations, lockfiles, shared fixtures, route composition, or dependency ordering. Task numbers alone prove nothing. Stop and serialize assignments as soon as overlap or an ordering dependency appears.

## Result Handling

- **DONE:** inspect the report and actual diff, then integrate or proceed.
- **DONE_WITH_CONCERNS:** review each concern at primary-agent level before proceeding.
- **NEEDS_CONTEXT:** provide the missing context and resume the same bounded assignment. Retain the task only when the newly known scope shows it is no longer safely bounded; do not guess.
- **BLOCKED:** change context, scope, ordering, or retain the work. Never retry a vague assignment unchanged.

## Completion

Run broad checks directly or through an explicit `validation` assignment. Diagnose failures at the primary-agent level; delegate only bounded fixes, then rerun the checks. Before claiming success, invoke `verification-before-completion` and confirm the evidence.

## Common Mistakes

- Delegating a plan path instead of complete task text and context.
- Parallelizing by task number rather than proven disjointness.
- Accepting worker self-review as final review.
- Forcing a blocked worker to retry unchanged.
- Triggering solely because a plan exists.
- Delegating architecture, ambiguity, or overall completion to an executor.
