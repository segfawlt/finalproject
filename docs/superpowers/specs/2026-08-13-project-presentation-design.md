# Project Presentation Design

**Date:** 2026-08-13  
**Format:** Self-contained HTML/CSS presentation  
**Audience:** Technical and academic assessors  
**Duration:** Approximately 10 minutes, followed by a live system demonstration

## Goal

Present the engineering rationale and safety architecture behind the Discord
Platform, rather than re-demonstrating the product UI. The deck must make the
planning boundary clear: an LLM never blindly edits Discord. It produces a
declarative target state that users can inspect, validate, approve, and safely
execute.

## Content Strategy

Slides use minimal text, one central claim, and a supporting visual or short
list. The presenter supplies the detailed explanation. Studio and templates
are supporting capabilities, not primary sections. The final slide explicitly
hands off to the live demonstration.

## Slide Outline

1. **Title** — AI-Driven Declarative Discord Server Management.
2. **Why this problem matters** — administrator pain points (repetition,
   costly permission mistakes, hard-to-review changes) alongside organisation
   needs (repeatable setups, policy enforcement, audit trails).
3. **The risk of direct AI editing** — ambiguity, destructive changes, and
   insufficient human visibility make a direct prompt-to-API model unsafe.
4. **Plan before execution** — prompt → desired state → diff → validation →
   approval → execution.
5. **Declarative DesiredState** — describe the intended server configuration,
   rather than an unverified imperative action sequence.
6. **System architecture** — React/Vite client; Hono services; PostgreSQL and
   Drizzle persistence; planning/execution engine; Discord.js bot;
   OpenRouter-compatible LLM.
7. **Controlled AI planning** — constrained tool calls modify DesiredState;
   the planner can ask users for clarification instead of inventing values.
8. **Deterministic diff engine** — current state versus target state yields
   minimal, ordered operations across categories, channels, roles,
   permission overwrites, and member roles.
9. **Validation boundary** — structural, permission, hierarchy, dependency,
   duplicate-name, channel-type, and configured guild-rule checks.
10. **Fail-closed policy enforcement** — configured rules block execution
    when policy evaluation fails, is malformed, or reaches its time limit.
11. **Safe execution and recovery** — per-guild locks, preconditions, symbol
    resolution, retries, deadlines, snapshots, and diff-based rollback.
12. **External change is expected** — Discord drift is persisted and streamed;
    stale plans require a fresh AI re-plan from the latest server state.
13. **Supporting workflows** — Studio offers conversational review and a
    Discord-like preview; reusable templates convey starting structures and
    context to the planning model.
14. **Engineering quality** — Discord OAuth, guild authorization, rate
    limiting, persisted plan/conversation history, SSE feedback, and 49
    Vitest files across the monorepo.
15. **Outcome and demo handoff** — natural-language intent becomes a safer,
    inspectable, reviewable Discord configuration plan; transition to the live
    demo.

## Deck Behaviour

- One standalone HTML file with local CSS and JavaScript only.
- Full-screen slides with arrow-key navigation and an unobtrusive progress
  indicator.
- No dependency on a development server or the running product.
- Use lightweight CSS diagrams and inline iconography rather than screenshots
  wherever possible, keeping focus on the architecture and workflow.
- Keep each slide readable at a distance and avoid dense implementation text.

## Verification

- Open the deck locally and confirm all 15 slides render.
- Confirm left/right arrow keys, Space, and on-screen controls navigate
  without leaving the deck bounds.
- Confirm the slide count, central planning narrative, and live-demo handoff
  match this specification.
