# Studio Guild Selector and Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add useful guild recency/refresh affordances and make fresh and ongoing Studio conversations share one composer.

**Architecture:** Extend the guild list response with one latest-conversation summary per guild. Extract the existing ongoing composer into a shared component with fresh/revise callbacks, then render it for both empty and active conversations.

**Tech Stack:** Hono, Drizzle ORM, React, React Router, Zustand, Vitest, Tailwind CSS.

---

### Task 1: Guild recency API

**Files:**

- Modify: `apps/server/src/hono/routes/guilds.ts`
- Test: `apps/server/src/hono/routes/guilds.test.ts`

- [ ] Add a `latestConversation` response object with `prompt` and `updatedAt`, selected from the newest conversation for each visible guild.
- [ ] Return `latestConversation: null` when no conversation exists.
- [ ] Add route tests for newest ordering and no-conversation behavior using the existing Hono route-test conventions.
- [ ] Run `pnpm exec vitest run apps/server/src/hono/routes/guilds.test.ts` and verify pass.

### Task 2: Guild selector refresh and preview

**Files:**

- Modify: `apps/web/src/routes/Studio.tsx`
- Create or modify: `apps/web/src/lib/guild-selector.ts`
- Test: `apps/web/src/lib/guild-selector.test.ts`

- [ ] Add a refresh button that refetches guilds and invite data, disables during the request, and exposes an accessible label.
- [ ] Render guild icons with an initials fallback, short prompt preview, and relative updated time.
- [ ] Keep empty state usable and make failed fetches visible instead of silently presenting an empty list.
- [ ] Test relative-time formatting and prompt truncation before implementation, then run the focused suite.

### Task 3: Shared Studio composer

**Files:**

- Modify: `apps/web/src/components/studio/ChatArea.tsx`
- Modify: `apps/web/src/components/studio/WelcomeScreen.tsx`
- Test: `apps/web/src/components/studio/ChatArea.test.tsx`

- [ ] Extract the current `ReviseInput` into a shared composer supporting fresh and revise submit callbacks.
- [ ] Render the shared composer in the no-conversation state with a time-based greeting and `createConversation` callback.
- [ ] Remove suggestion cards, onboarding explanation, and the large welcome textarea.
- [ ] Preserve model selector, loading state, disabled state, Enter/submit behavior, and ongoing revise behavior.
- [ ] Add render tests for fresh and ongoing callback wiring, then run focused tests and web typecheck.

### Task 4: Documentation and verification

**Files:**

- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] Update the Studio and guild-selector entries to describe refresh, recency previews, and the shared composer.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test:run`.
- [ ] Run `pnpm lint` and `pnpm format:check`.
