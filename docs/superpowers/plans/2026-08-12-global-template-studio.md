# Global Template Studio and Resizable Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver creator-owned global templates with immutable versions, direct and AI authoring, and a shared Studio shell whose left and right panels resize and hide independently.

**Architecture:** Land the shell and navigation as one isolated web unit, then add transactional template persistence and creator-scoped APIs before building the dedicated planning-only `TemplateSession`. The library, viewer, Template Studio, and Server Studio consume those boundaries without connecting template authoring to Discord execution.

**Tech Stack:** PostgreSQL, Drizzle ORM, Hono, TypeScript, React 18, React Router, Zustand, Tailwind CSS, SSE, Vitest, Testing Library.

---

## File Structure

### Shared Studio shell

- `apps/web/src/hooks/useStudioShellLayout.ts`: panel width/visibility state, persistence, and resize clamping.
- `apps/web/src/components/studio/StudioShell.tsx`: three-column rendering, separators, and independent restore controls.
- `apps/web/src/components/studio/WorkspaceSidebar.tsx`: product routes, new chat, recent conversations, contextual content, and active server identity.
- `apps/web/src/components/studio/StudioHeader.tsx`: route actions and independent panel toggle buttons.
- `apps/web/src/stores/studioStore.ts`: active guild retained across global template routes.

### Template persistence and APIs

- `packages/db/src/schema.ts`: current template, immutable version, and authoring-turn tables.
- `apps/server/src/templates/template-state.ts`: conversions between stored structure and `DesiredState`.
- `apps/server/src/templates/template-version-service.ts`: transactional create/fork/manual/revert/AI version writes.
- `apps/server/src/hono/routes/templates.ts`: creator-scoped HTTP lifecycle and authoring endpoints.

### Template authoring

- `apps/server/src/planning/template-session.ts`: natural-language planning loop over template state only.
- `apps/server/src/planning/template-session-manager.ts`: active template-session registry.
- `apps/server/src/planning/template-event-bus.ts`: bounded SSE replay by authoring turn.
- `apps/web/src/hooks/useTemplateAuthoring.ts`: authoring requests, SSE, ask-user, cancellation, and refresh.

### Template UI

- `apps/web/src/routes/Templates.tsx`: global creator library.
- `apps/web/src/routes/TemplateViewer.tsx`: canonical read-only viewer.
- `apps/web/src/routes/TemplateStudio.tsx`: AI transcript, metadata, direct editing, and live preview.
- `apps/web/src/components/template-studio/TemplateVersionHistory.tsx`: historical selection and revert.
- `apps/web/src/components/template-studio/TemplatePreview.tsx`: structure/roles preview and manual editing.

---

### Task 1: Add browser-component test support

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`

- [ ] **Step 1: Install the web test dependencies**

Run:

```bash
pnpm --filter @repo/web add -D @testing-library/jest-dom @testing-library/react @testing-library/user-event jsdom
```

Expected: `apps/web/package.json` contains all four packages in `devDependencies` and the lockfile changes.

- [ ] **Step 2: Extend Vitest to include TSX tests and the web setup file**

Change `vitest.config.ts` to:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    envDir: ".",
    include: [
      "packages/*/src/**/*.{test,spec}.{ts,tsx,js}",
      "apps/*/src/**/*.{test,spec}.{ts,tsx,js}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["apps/web/src/test/setup.ts"],
  },
});
```

Create `apps/web/src/test/setup.ts`:

```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Run the existing web tests**

Run:

```bash
pnpm exec vitest run apps/web/src
```

Expected: all existing web tests pass and no existing `.test.ts` file is skipped.

- [ ] **Step 4: Commit the test harness**

```bash
git add apps/web/package.json pnpm-lock.yaml vitest.config.ts apps/web/src/test/setup.ts
git commit -m "test(web): add component test harness"
```

### Task 2: Build independent resizable panel state

**Files:**

- Create: `apps/web/src/hooks/useStudioShellLayout.ts`
- Create: `apps/web/src/hooks/useStudioShellLayout.test.ts`
- Modify: `apps/web/src/components/studio/StudioShell.tsx`
- Delete: `apps/web/src/components/studio/StudioShell.test.ts`
- Create: `apps/web/src/components/studio/StudioShell.test.tsx`

- [ ] **Step 1: Write failing tests for persisted, clamped panel state**

Create `apps/web/src/hooks/useStudioShellLayout.test.ts` with `// @vitest-environment jsdom` and cover these exact rules:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  clampPanelWidth,
  readStudioShellLayout,
} from "./useStudioShellLayout";

describe("studio shell layout", () => {
  it("clamps each panel without consuming the flexible center", () => {
    expect(clampPanelWidth("left", 100)).toBe(220);
    expect(clampPanelWidth("left", 900)).toBe(420);
    expect(clampPanelWidth("right", 100)).toBe(320);
    expect(clampPanelWidth("right", 900)).toBe(720);
  });

  it("falls back when persisted data is invalid", () => {
    localStorage.setItem("studio-shell-layout-v1", "not-json");
    expect(readStudioShellLayout()).toEqual({
      leftWidth: DEFAULT_LEFT_WIDTH,
      rightWidth: DEFAULT_RIGHT_WIDTH,
      leftVisible: true,
      rightVisible: true,
    });
  });
});
```

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/hooks/useStudioShellLayout.test.ts
```

Expected: FAIL because `useStudioShellLayout.ts` does not exist.

- [ ] **Step 3: Implement the layout hook**

Export these constants and functions from `useStudioShellLayout.ts`:

```ts
export const DEFAULT_LEFT_WIDTH = 260;
export const DEFAULT_RIGHT_WIDTH = 520;
export const STUDIO_SHELL_STORAGE_KEY = "studio-shell-layout-v1";

const LIMITS = {
  left: { min: 220, max: 420 },
  right: { min: 320, max: 720 },
} as const;

export function clampPanelWidth(side: "left" | "right", width: number): number {
  return Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, width));
}
```

`readStudioShellLayout()` must validate every parsed field before returning it. The hook must expose:

```ts
interface StudioShellLayout {
  leftWidth: number;
  rightWidth: number;
  leftVisible: boolean;
  rightVisible: boolean;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  resetLeftWidth: () => void;
  resetRightWidth: () => void;
}
```

Persist each state transition to the storage key. Guard `window` access for node rendering.

- [ ] **Step 4: Write failing shell interaction tests**

Replace `StudioShell.test.ts` with jsdom tests that render the shell and assert:

```tsx
render(
  <StudioShell sidebar={<div>navigation</div>} rightPanel={<div>preview</div>}>
    <div>chat</div>
  </StudioShell>
);

expect(screen.getByRole("separator", { name: "Resize navigation" })).toBeVisible();
expect(screen.getByRole("separator", { name: "Resize preview" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Hide navigation" }));
expect(screen.queryByText("navigation")).toBeNull();
expect(screen.getByRole("button", { name: "Show navigation" })).toBeVisible();
expect(screen.getByText("preview")).toBeVisible();
```

Also test that hiding preview does not hide navigation and that double-clicking each separator resets only that side.

- [ ] **Step 5: Run the shell test and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/components/studio/StudioShell.test.tsx
```

Expected: FAIL because the existing shell has fixed widths and no shell-owned controls.

- [ ] **Step 6: Implement the shared shell**

Change `StudioShell` to use `useStudioShellLayout()`. Render visible sidebars with inline widths, the center as `flex-1 min-w-0`, and separators with:

```tsx
role="separator"
aria-label={side === "left" ? "Resize navigation" : "Resize preview"}
aria-orientation="vertical"
tabIndex={0}
```

Pointer movement computes width from `clientX`; right width uses `window.innerWidth - clientX`. Arrow keys move by 16px, `Shift+Arrow` moves by 48px. Double-click restores the matching default. Hide controls use `PanelLeftClose` and `PanelRightClose`; when hidden, restore controls remain at the corresponding header edge. Below Tailwind's `lg` breakpoint, omit separators and render panels as independently toggled fixed overlays.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm exec vitest run apps/web/src/hooks/useStudioShellLayout.test.ts apps/web/src/components/studio/StudioShell.test.tsx
```

Expected: both files pass.

- [ ] **Step 8: Commit the shell behavior**

```bash
git add apps/web/src/hooks/useStudioShellLayout.ts apps/web/src/hooks/useStudioShellLayout.test.ts apps/web/src/components/studio/StudioShell.tsx apps/web/src/components/studio/StudioShell.test.tsx
git commit -m "feat(web): add resizable Studio panels"
```

### Task 3: Replace conversation collapse with workspace navigation

**Files:**

- Create: `apps/web/src/components/studio/WorkspaceSidebar.tsx`
- Create: `apps/web/src/components/studio/WorkspaceSidebar.test.tsx`
- Modify: `apps/web/src/stores/studioStore.ts`
- Modify: `apps/web/src/stores/studioStore.test.ts`
- Delete: `apps/web/src/components/studio/ConversationSidebar.tsx`
- Modify: `apps/web/src/routes/Studio.tsx`
- Modify: `apps/web/src/components/studio/StudioHeader.tsx`
- Modify: `apps/web/src/components/AppLayout.tsx`

- [ ] **Step 1: Write failing active-guild persistence tests**

Extend `studioStore.test.ts` to assert that `setSelectedGuild("guild-1")` updates both Zustand state and `localStorage.getItem("active-guild-id")`, and that setting `null` removes the key.

- [ ] **Step 2: Run the store test and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/stores/studioStore.test.ts
```

Expected: FAIL because `setSelectedGuild` does not persist.

- [ ] **Step 3: Persist active guild safely**

Add guarded helpers to `studioStore.ts`:

```ts
const ACTIVE_GUILD_KEY = "active-guild-id";

function readActiveGuild(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_GUILD_KEY);
}
```

Initialize `selectedGuild` from `readActiveGuild()` and make `setSelectedGuild` update storage before Zustand state.

- [ ] **Step 4: Write failing workspace-sidebar tests**

Render `WorkspaceSidebar` inside `MemoryRouter` with a mocked `apiFetch`. Assert:

- `Studio` links to the retained guild route.
- `Templates` links to `/templates`.
- `New chat` invokes `onNewChat` in Server Studio and navigates to `/studio/:guildId` elsewhere.
- Recent conversations appear below route entries.
- Contextual children appear below recent conversations.
- Active server identity is the final item and links to `/studio`; authenticated account/sign-out
  remains available in the same footer.
- No internal collapse button or collapsed rail exists.

- [ ] **Step 5: Run the component test and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/components/studio/WorkspaceSidebar.test.tsx
```

Expected: FAIL because `WorkspaceSidebar` does not exist.

- [ ] **Step 6: Implement `WorkspaceSidebar`**

Use this public contract:

```ts
interface WorkspaceSidebarProps {
  guildId: string | null;
  guildName: string | null;
  activeConversationId?: string | null;
  onSelectConversation?: (conversationId: string) => void;
  onNewChat?: () => void;
  contextTitle?: string;
  children?: ReactNode;
}
```

Fetch `/api/guilds/:guildId/conversations` only when `guildId` exists. Keep the existing date grouping and conversation item behavior. Render `Studio`, `Templates`, and `New chat` before `Recent conversations`; render contextual children after conversations; pin the server selector to the bottom.

- [ ] **Step 7: Wire Server Studio to the workspace sidebar**

In `Studio.tsx`, set the active guild in an effect whenever `guildId` changes, and pass `WorkspaceSidebar` for both picker and guild routes. Remove the child-owned collapse behavior. In `StudioHeader`, accept the shell toggle callbacks and expose one labeled control for each side. In `AppLayout`, remove `AppHeader` so product identity is not duplicated above the approved sidebar shell. Move the existing authenticated user and sign-out behavior into `WorkspaceSidebar`; do not remove account access.

- [ ] **Step 8: Run focused web tests and typecheck**

Run:

```bash
pnpm exec vitest run apps/web/src/stores/studioStore.test.ts apps/web/src/components/studio/WorkspaceSidebar.test.tsx apps/web/src/components/studio/StudioShell.test.tsx
pnpm --filter @repo/web typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 9: Commit navigation**

```bash
git add apps/web/src/components/studio apps/web/src/stores/studioStore.ts apps/web/src/stores/studioStore.test.ts apps/web/src/routes/Studio.tsx apps/web/src/components/AppLayout.tsx
git commit -m "feat(web): add persistent Studio navigation"
```

### Task 4: Add immutable template persistence

**Files:**

- Modify: `packages/db/src/schema.ts`
- Create: generated `packages/db/drizzle/0012_*.sql`
- Modify: generated `packages/db/drizzle/meta/0012_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

- [ ] **Step 1: Add version and authoring-turn tables to the Drizzle schema**

Make `templates.authorId` non-null, remove `templates.guildId`, and keep `templates.structure` as the current materialized structure. Define:

```ts
export const templateAuthoringTurns = pgTable(
  "template_authoring_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    prompt: text("prompt").notNull(),
    baseVersion: integer("base_version").notNull(),
    messages: jsonb("messages").notNull().default([]),
    status: text("status").notNull().default("planning"),
    summary: text("summary"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_turns_template_created").on(table.templateId, table.createdAt),
    index("idx_template_turns_author").on(table.authorId),
  ]
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    structure: jsonb("structure").notNull(),
    source: text("source").notNull(),
    authoringTurnId: uuid("authoring_turn_id").references(() => templateAuthoringTurns.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_template_versions_template_created").on(table.templateId, table.createdAt),
    uniqueIndex("uniq_template_versions_template_version").on(table.templateId, table.version),
  ]
);
```

Add relations from users/templates/turns/versions and remove the guild-template relation.

- [ ] **Step 2: Generate the migration**

Run:

```bash
pnpm db:generate
```

Expected: Drizzle creates migration number `0012`, its snapshot, and a journal entry.

- [ ] **Step 3: Add deterministic data migration statements**

Inspect the generated SQL, then insert these statements before enforcing non-null ownership or dropping `guild_id`:

```sql
DELETE FROM "templates" WHERE "author_id" IS NULL;
INSERT INTO "template_versions" ("template_id", "version", "structure", "source")
SELECT "id", "version", "structure", 'initial' FROM "templates";
```

The deletion is intentional: ownerless rows cannot satisfy creator-only visibility. Existing owned guild templates become global when the obsolete `guild_id` column is dropped.

- [ ] **Step 4: Inspect and typecheck the migration**

Run:

```bash
git diff -- packages/db/src/schema.ts packages/db/drizzle
pnpm --filter @repo/db typecheck
```

Expected: one migration creates both tables, backfills one immutable version per owned template, removes `guild_id`, and the package typecheck passes. Do not run `pnpm db:migrate` unless the user explicitly asks to modify the local database.

- [ ] **Step 5: Commit schema and migration**

```bash
git add packages/db/src/schema.ts packages/db/drizzle
git commit -m "feat(db): add template version history"
```

### Task 5: Implement transactional template version service

**Files:**

- Create: `apps/server/src/templates/template-state.ts`
- Create: `apps/server/src/templates/template-version-service.ts`
- Create: `apps/server/src/templates/template-version-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Mock the Drizzle transaction and cover:

- Blank creation stores empty `channels`, `roles`, `overwrites`, and `memberRoles`, plus version 1 source `initial`.
- Seeded creation stores the supplied completed-plan structure directly as version 1.
- Fork copies structure/metadata, names it `Fork of <name>`, and creates independent version 1.
- Metadata update leaves `version` and version rows unchanged.
- Manual save with matching `expectedVersion` creates the next version and updates materialized structure.
- Stale `expectedVersion` throws `TemplateVersionConflictError`.
- Revert copies the old snapshot into a new highest version with source `revert`.
- AI completion creates source `ai` with its turn ID.
- Structurally unchanged AI completion creates no redundant version.

Use structural JSON equality through a stable stringifier so object key order does not create a version.

- [ ] **Step 2: Run the service test and verify RED**

Run:

```bash
pnpm exec vitest run apps/server/src/templates/template-version-service.test.ts
```

Expected: FAIL because the service files do not exist.

- [ ] **Step 3: Implement template-state conversion**

Export:

```ts
export type TemplateStructure = DesiredState["active"];

export function emptyTemplateStructure(): TemplateStructure;
export function toTemplateDesiredState(
  templateId: string,
  name: string,
  version: number,
  structure: unknown
): DesiredState;
export function fromTemplateDesiredState(state: DesiredState): TemplateStructure;
```

Normalize absent maps to empty objects and seed `symbolCounter` above the greatest `$ch_N`, `$cat_N`, or `$role_N` suffix. Never include tombstones in persisted template structure.

- [ ] **Step 4: Implement the version service**

Export `createTemplate`, `forkTemplate`, `updateTemplateMetadata`, `commitTemplateStructure`, and `revertTemplateVersion`. `createTemplate` accepts an optional normalized structure and uses the empty structure only when it is absent. Every structural method runs in `db.transaction`, selects the creator-owned template with `for("update")`, checks `expectedVersion`, inserts the immutable snapshot, and updates `templates.structure`, `templates.version`, and `updatedAt` before returning.

Use this error contract:

```ts
export class TemplateVersionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Template changed at version ${currentVersion}`);
  }
}
```

- [ ] **Step 5: Run service tests**

Run:

```bash
pnpm exec vitest run apps/server/src/templates/template-version-service.test.ts
```

Expected: all service tests pass.

- [ ] **Step 6: Commit the persistence service**

```bash
git add apps/server/src/templates
git commit -m "feat(server): add template version service"
```

### Task 6: Replace template routes with creator-scoped lifecycle APIs

**Files:**

- Replace: `apps/server/src/hono/routes/templates.test.ts`
- Modify: `apps/server/src/hono/routes/templates.ts`
- Modify: `apps/server/src/hono/app.ts`
- Modify: `apps/web/src/components/studio/SaveTemplateModal.tsx`

- [ ] **Step 1: Write failing route tests**

Mount the app at both `/templates` and `/guilds/:guildId/templates`. Test these requests:

```text
GET    /templates
POST   /templates
GET    /templates/:templateId
PATCH  /templates/:templateId
DELETE /templates/:templateId
POST   /templates/:templateId/fork
GET    /templates/:templateId/versions
GET    /templates/:templateId/versions/:version
POST   /templates/:templateId/versions
POST   /templates/:templateId/versions/:version/revert
POST   /guilds/:guildId/templates/:templateId/merge
```

Assert list/detail/version queries include `authorId = user.id`; non-owned IDs return `404`; blank create and fork delegate to the version service; metadata uses `PATCH`; manual save requires `{ structure, expectedVersion }`; conflict maps to `409` with `currentVersion`; delete is immediate; merge stays `410`.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts
```

Expected: FAIL because current routes expose per-guild semantics, use `PUT`, and lack version/fork endpoints.

- [ ] **Step 3: Implement creator-scoped route schemas**

Use these request shapes:

```ts
const createTemplateSchema = z.object({
  name: z.string().trim().min(1).default("Untitled template"),
  description: z.string().default(""),
  structure: z.record(z.unknown()).optional(),
});

const metadataSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

const structureSchema = z.object({
  structure: z.record(z.unknown()),
  expectedVersion: z.number().int().positive(),
});
```

Generate text IDs server-side with `crypto.randomUUID()`. Map `TemplateVersionConflictError` to `409`. Return `404` for absent and non-owned resources.

- [ ] **Step 4: Keep the guild route as a creator-filtered compatibility alias**

The guild mount returns the same authenticated creator's global templates and supports reads needed by Server Studio. It does not restore per-guild ownership. Keep the merge handler returning `410 Gone`.

- [ ] **Step 5: Make SaveTemplateModal create global templates**

Change its POST target from `/api/guilds/:guildId/templates` to `/api/templates` and include the completed plan structure in the creation request. The service stores that structure atomically as version 1, avoiding an intermediate blank version.

- [ ] **Step 6: Run route tests and server/web typechecks**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts
pnpm --filter @repo/server typecheck
pnpm --filter @repo/web typecheck
```

Expected: tests and both typechecks pass.

- [ ] **Step 7: Commit API lifecycle**

```bash
git add apps/server/src/hono/routes/templates.ts apps/server/src/hono/routes/templates.test.ts apps/server/src/hono/app.ts apps/web/src/components/studio/SaveTemplateModal.tsx
git commit -m "feat(server): add global template lifecycle"
```

### Task 7: Build the planning-only TemplateSession

**Files:**

- Create: `apps/server/src/planning/template-session.ts`
- Create: `apps/server/src/planning/template-session.test.ts`
- Create: `apps/server/src/planning/template-session-manager.ts`
- Create: `apps/server/src/planning/template-event-bus.ts`
- Create: `apps/server/src/planning/template-event-bus.test.ts`
- Modify: `packages/shared/src/tools/registry.ts`
- Create: `packages/shared/src/tools/registry.test.ts`

- [ ] **Step 1: Add a filtered tool-definition API with failing tests**

Extend the registry test to require:

```ts
const definitions = getOpenAIFunctionDefinitions(TEMPLATE_TOOL_NAMES);
expect(definitions.map((definition) => definition.function.name)).not.toContain(
  "add_role_to_member"
);
expect(definitions.map((definition) => definition.function.name)).toContain("ask_user");
```

Export `TEMPLATE_TOOL_NAMES` containing category, channel, role, overwrite, and `ask_user` tools only. Change `getOpenAIFunctionDefinitions` to accept an optional readonly name allowlist while preserving existing no-argument behavior.

- [ ] **Step 2: Run the registry test and verify RED**

Run:

```bash
pnpm exec vitest run packages/shared/src/tools/registry.test.ts
```

Expected: FAIL because filtering is unsupported.

- [ ] **Step 3: Implement and verify registry filtering**

Run the same command after implementation. Expected: PASS, including all existing registry invariants.

- [ ] **Step 4: Write failing TemplateSession tests**

Inject an `invokeLLM` function into `TemplateSession` so tests can return deterministic assistant/tool messages. Cover:

- A natural-language turn calls multiple allowed tools and commits once after the final assistant response.
- `onComplete` receives the final structure and messages before the emitted `completed` event.
- Member-role tool calls return a tool error and cannot mutate state.
- `ask_user` emits a question, persists waiting state, and resumes with the answer.
- Cancel restores the pre-turn snapshot and emits no completion.
- Provider failure emits `error` and creates no version callback.
- An unchanged assistant-only turn completes without requesting a structural commit.

- [ ] **Step 5: Run TemplateSession tests and verify RED**

Run:

```bash
pnpm exec vitest run apps/server/src/planning/template-session.test.ts
```

Expected: FAIL because `TemplateSession` does not exist.

- [ ] **Step 6: Implement the dedicated session**

Use this constructor boundary:

```ts
interface TemplateSessionOptions {
  templateId: string;
  turnId: string;
  creatorId: string;
  prompt: string;
  initialState: DesiredState;
  messages?: LLMMessage[];
  emit: PlanningEventEmitter;
  invokeLLM?: (request: TemplateLLMRequest) => Promise<LLMMessage>;
  onStateChange: (session: TemplateSession) => Promise<void>;
  onComplete: (session: TemplateSession, changed: boolean) => Promise<void>;
}
```

Reuse `buildLLMRequest`, `parseOpenRouterStream`, `prepareMessagesForModel`, `DesiredStateStore`, and the filtered shared registry. Do not import bot cache, Discord execute context, guild formatter, validation, diff, plans, or execution engine. The template system prompt must state that the user is editing a reusable global structure with no members or Discord execution.

- [ ] **Step 7: Implement manager and event bus**

The manager is a `Map<turnId, { creatorId, templateId, session }>` with get/set/remove functions that require matching creator and template IDs. The event bus mirrors bounded terminal replay from `planning-event-bus.ts`, keyed by turn ID, and replays `ask_user`, `completed`, `error`, and `expired`.

- [ ] **Step 8: Run authoring unit tests**

Run:

```bash
pnpm exec vitest run packages/shared/src/tools/registry.test.ts apps/server/src/planning/template-session.test.ts apps/server/src/planning/template-event-bus.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Commit authoring core**

```bash
git add packages/shared/src/tools/registry.ts packages/shared/src/tools/registry.test.ts apps/server/src/planning/template-session.ts apps/server/src/planning/template-session.test.ts apps/server/src/planning/template-session-manager.ts apps/server/src/planning/template-event-bus.ts apps/server/src/planning/template-event-bus.test.ts
git commit -m "feat(server): add template authoring session"
```

### Task 8: Wire persisted authoring endpoints and SSE

**Files:**

- Modify: `apps/server/src/hono/routes/templates.ts`
- Modify: `apps/server/src/hono/routes/templates.test.ts`

- [ ] **Step 1: Write failing authoring route tests**

Cover:

```text
GET  /templates/:templateId/turns
POST /templates/:templateId/turns
GET  /templates/:templateId/turns/:turnId/stream
POST /templates/:templateId/turns/:turnId/answer
POST /templates/:templateId/turns/:turnId/cancel
```

Assert every request rechecks creator ownership. Starting a turn inserts `template_authoring_turns` before launching the async session and returns `202`. `ask_user`, cancel, failure, and completion persist status/messages. Completion calls `commitTemplateStructure(..., "ai", turnId)` before emitting `completed`. Non-owner and mismatched template/turn pairs return `404`.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts
```

Expected: FAIL because authoring routes do not exist.

- [ ] **Step 3: Implement turn creation and persistence callbacks**

Start from the current template structure converted by `toTemplateDesiredState`. Load the latest turn's cumulative messages, append the new prompt, and persist `planning` with the current template version as `baseVersion` before calling `session.start()` without awaiting the entire provider turn in the HTTP handler. In callbacks:

- `onStateChange` updates messages and waiting/planning status.
- `onComplete` transactionally commits one AI version with `expectedVersion: baseVersion` when changed, updates messages/summary/status, then emits `completed`.
- Catch updates status/error before emitting `error`.
- `finally` removes terminal sessions from the manager.

- [ ] **Step 4: Implement SSE, answer, and cancel routes**

Use Hono `streamSSE`. Send `streaming_ready`, subscribe to the template event bus, write event fields matching planning SSE, and heartbeat every 30 seconds. Answer calls `resume`; cancel calls `cancel`, persists `cancelled`, removes the session, and returns `{ cancelled: true }`.

- [ ] **Step 5: Run focused server tests and typecheck**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts apps/server/src/planning/template-session.test.ts apps/server/src/planning/template-event-bus.test.ts
pnpm --filter @repo/server typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit authoring transport**

```bash
git add apps/server/src/hono/routes/templates.ts apps/server/src/hono/routes/templates.test.ts
git commit -m "feat(server): expose template authoring streams"
```

### Task 9: Canonicalize the global library and viewer

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/routes/Templates.tsx`
- Modify: `apps/web/src/routes/TemplateViewer.tsx`
- Modify: `apps/web/src/routes/TemplateEditor.tsx`
- Modify: `apps/web/src/components/DesiredStateView.tsx`
- Create: `apps/web/src/routes/Templates.test.tsx`
- Create: `apps/web/src/routes/TemplateViewer.test.tsx`

- [ ] **Step 1: Write failing route/component tests**

Test that:

- `/templates` lists only API results and searches name/description/category.
- `Create blank template` POSTs metadata and navigates to `/templates/:id/studio`.
- Template cards navigate to `/templates/:id`.
- Viewer renders categories/channels and roles, not members/tombstones.
- Fork calls `/api/templates/:id/fork` and opens the returned Studio route.
- Delete immediately sends `DELETE` without `window.confirm` and returns to `/templates`.
- Legacy `/templates/view/:id`, `/templates/studio/:id`, and guild-scoped editor URLs redirect to canonical routes.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx
```

Expected: FAIL because routes and lifecycle actions still use interim URLs and client-side fork creation.

- [ ] **Step 3: Implement canonical routes**

Register specific routes in this order:

```tsx
<Route path="/templates" element={<Templates />} />
<Route path="/templates/:templateId/studio" element={<TemplateEditor />} />
<Route path="/templates/:templateId" element={<TemplateViewer />} />
<Route path="/templates/view/:templateId" element={<LegacyTemplateViewerRedirect />} />
<Route path="/templates/studio/:templateId" element={<LegacyTemplateStudioRedirect />} />
<Route path="/templates/:guildId/:templateId" element={<LegacyGuildTemplateRedirect />} />
```

Declare legacy redirect components before `App`; they map route params without fetching. Fix
`TemplateEditor` so a missing `guildId` does not prevent its global API fetch; Task 10 replaces
this interim editor after the canonical route is already live.

- [ ] **Step 4: Update library and viewer lifecycle calls**

Use the server fork endpoint rather than constructing IDs or copying structure in the browser. Remove `isOfficial` and per-guild branches from global components. Add explicit `showMembers` and `showTombstones` props to `DesiredStateView`, defaulting both to `true` so Server Studio does not change, and pass `false` from template views. Wrap both routes in `StudioShell` and `WorkspaceSidebar`; neither route supplies a right panel.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx apps/web/src/components/studio/WorkspaceSidebar.test.tsx
pnpm --filter @repo/web typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit global browsing**

```bash
git add apps/web/src/App.tsx apps/web/src/components/DesiredStateView.tsx apps/web/src/routes/Templates.tsx apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.tsx apps/web/src/routes/TemplateViewer.test.tsx apps/web/src/routes/TemplateEditor.tsx
git commit -m "feat(web): add global template library"
```

### Task 10: Build the Template Studio UI

**Files:**

- Create: `apps/web/src/routes/TemplateStudio.tsx`
- Delete: `apps/web/src/routes/TemplateEditor.tsx`
- Create: `apps/web/src/hooks/useTemplateAuthoring.ts`
- Create: `apps/web/src/hooks/useTemplateAuthoring.test.ts`
- Create: `apps/web/src/components/template-studio/TemplateVersionHistory.tsx`
- Create: `apps/web/src/components/template-studio/TemplateVersionHistory.test.tsx`
- Create: `apps/web/src/components/template-studio/TemplatePreview.tsx`
- Create: `apps/web/src/components/template-studio/TemplatePreview.test.tsx`

- [ ] **Step 1: Write failing authoring-hook tests**

Mock `apiFetch` and `EventSource`. Cover start, streaming tool events, `ask_user`, answer, cancel, terminal completion refresh callback, and terminal error. Assert the hook closes the prior EventSource before starting another turn and never exposes Discord plan approval/execution actions.

- [ ] **Step 2: Run the hook test and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/hooks/useTemplateAuthoring.test.ts
```

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement `useTemplateAuthoring`**

Expose:

```ts
interface TemplateAuthoringState {
  turns: TemplateTurn[];
  activeTurnId: string | null;
  status: "idle" | "planning" | "waiting_for_user" | "error";
  question: PlanningQuestion | null;
  error: string;
  submit: (prompt: string) => Promise<void>;
  answer: (answer: string) => Promise<void>;
  cancel: () => Promise<void>;
}
```

Fetch persisted turns on mount. Start an EventSource for the returned turn ID. On `completed`, close the stream, refetch turns, and invoke `onTemplateChanged` so structure and versions refresh only after server persistence.

- [ ] **Step 4: Write failing version-history and preview tests**

Assert newest-first versions, historical selection, revert request with current `expectedVersion`, and read-only historical preview. For preview, assert `Edit structure` creates a local draft, `Cancel` discards it, and `Save structure` sends one version request. Verify an attempted version switch while dirty invokes the save-or-cancel guard rather than replacing the draft.

- [ ] **Step 5: Run component tests and verify RED**

Run:

```bash
pnpm exec vitest run apps/web/src/components/template-studio
```

Expected: FAIL because the components do not exist.

- [ ] **Step 6: Implement version history and direct editing**

`TemplateVersionHistory` receives current/selected version and callbacks. `TemplatePreview` wraps stored structure through `toTemplateDesiredState`-equivalent web logic, reuses `useDesiredStateEdit`, and renders `DesiredStateView` with member/tombstone sections hidden. Keep draft state local until explicit save.

- [ ] **Step 7: Implement `TemplateStudio` composition**

Use `StudioShell` with:

- `WorkspaceSidebar` on the left and `TemplateVersionHistory` as contextual content below recent conversations.
- A center header with metadata save, viewer, fork, delete, and independent panel controls.
- Persisted authoring transcript and shared composer in the center.
- `TemplatePreview` in the wide right panel.

Before starting AI, selecting a historical version, reverting, navigating, or applying refreshed server data, check `isDirty`. Show one focused guard with `Save`, `Discard`, and `Stay`; do not silently lose the draft. AI completion auto-commits and refreshes without approval.

- [ ] **Step 8: Run all Template Studio tests and web typecheck**

Run:

```bash
pnpm exec vitest run apps/web/src/hooks/useTemplateAuthoring.test.ts apps/web/src/components/template-studio apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx
pnpm --filter @repo/web typecheck
```

Expected: all tests and typecheck pass.

- [ ] **Step 9: Commit Template Studio**

```bash
git add apps/web/src/routes/TemplateStudio.tsx apps/web/src/routes/TemplateEditor.tsx apps/web/src/hooks/useTemplateAuthoring.ts apps/web/src/hooks/useTemplateAuthoring.test.ts apps/web/src/components/template-studio
git commit -m "feat(web): add AI Template Studio"
```

### Task 11: Preserve Server Studio context and remove stale merge semantics

**Files:**

- Modify: `apps/web/src/components/studio/TemplatesTab.tsx`
- Modify: `apps/web/src/components/TemplatePanel.tsx`
- Modify: `apps/web/src/hooks/useConversation.ts`
- Modify: `apps/server/src/hono/routes/conversations.ts`
- Modify: tests adjacent to changed files

- [ ] **Step 1: Write failing cleanup tests**

Assert Server Studio presents `Use`, `Stop using`, and canonical viewer links, with no `Merge` label or merge-triggering request. Assert conversation template attach/detach remains supported and any dedicated merge route returns `410` without starting a planning session.

- [ ] **Step 2: Run focused tests and verify RED where stale behavior remains**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts apps/server/src/hono/routes/conversations.test.ts apps/web/src/components/studio
```

Expected: any remaining merge behavior fails the new assertions.

- [ ] **Step 3: Remove merge-only code paths**

Delete merge buttons, crafted merge prompts, `beginPlanning` calls used only by merge, and server session construction used only by template merge. Keep attach/detach and template system-prompt context. Point all browse links at `/templates/:templateId`.

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm exec vitest run apps/server/src/hono/routes/templates.test.ts apps/server/src/hono/routes/conversations.test.ts apps/web/src/components/studio
pnpm typecheck
```

Expected: tests and all workspace typechecks pass.

- [ ] **Step 5: Commit context cleanup**

```bash
git add apps/web/src/components/studio/TemplatesTab.tsx apps/web/src/components/TemplatePanel.tsx apps/web/src/hooks/useConversation.ts apps/server/src/hono/routes/conversations.ts
git commit -m "refactor: retire template merge flow"
```

### Task 12: Synchronize documentation and run final verification

**Files:**

- Modify: `docs/design/template-system.md`
- Modify: `docs/design/studio-and-dashboard.md`
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Update template-system documentation**

Replace per-server storage, three-level merge, auto-save, fork naming collision, and phased future-authoring sections with the implemented creator-only global lifecycle, canonical routes, explicit manual save, natural-language AI auto-commit, immutable versions, and `Use`/`Stop using` context semantics.

- [ ] **Step 2: Update Studio shell documentation**

Document the persistent route navigation, New chat, recent conversations, active server footer, independently resizable/hideable panels, flexible center, local persistence, and narrow-screen overlays.

- [ ] **Step 3: Update implementation status**

Bump `Last updated` to the execution date. Mark global library/viewer and Template Studio `done`; add `templateVersions`, `templateAuthoringTurns`, session files, shell hook, workspace sidebar, and tests to the matching sections. Remove stale `Merge` descriptions from route/component/hook entries and move the resolved global-template gap to `Recently resolved`.

- [ ] **Step 4: Run focused feature tests**

Run:

```bash
pnpm exec vitest run packages/shared/src/tools/registry.test.ts apps/server/src/templates apps/server/src/planning/template-session.test.ts apps/server/src/planning/template-event-bus.test.ts apps/server/src/hono/routes/templates.test.ts apps/web/src/hooks/useStudioShellLayout.test.ts apps/web/src/hooks/useTemplateAuthoring.test.ts apps/web/src/components/studio apps/web/src/components/template-studio apps/web/src/routes/Templates.test.tsx apps/web/src/routes/TemplateViewer.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 5: Run full repository verification**

Run:

```bash
pnpm typecheck
pnpm test:run
pnpm lint
pnpm format:check
```

Expected: all commands exit 0. If `format:check` reports unrelated pre-existing files, format only files changed by this plan and record the unrelated paths in the completion report; do not reformat unrelated work.

- [ ] **Step 6: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected: only intended source, tests, migration, lockfile, and synchronized docs are changed; `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit documentation**

```bash
git add docs/design/template-system.md docs/design/studio-and-dashboard.md docs/IMPLEMENTATION_STATUS.md
git commit -m "docs: document global Template Studio"
```
