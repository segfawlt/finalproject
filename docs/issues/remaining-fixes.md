# Remaining Fixes — Implementation Instructions

Session date: May 24, 2026

## What was already completed (for context)

| Issue              | What                                                                                                                                                  | Where                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A–F, G, O, P, B, L | Planning API — `POST /conversations`, `PlanningSession` wired, iteration snapshots, messages persisted, cancel, SSE                                   | `conversations.ts`, `planning-session.ts`, `session-manager.ts`, `planning-event-bus.ts`, `app.ts` |
| D, E, I            | Execution safety — stale `forkStateHash` check before execute, rollback `POST /plans/:id/rollback`, `getAssumptions()` pre-execution check (13 tools) | `plans.ts`, `registry.ts`, `evaluate-assumptions.ts`, 4 tool files                                 |
| C, H, K, M         | Studio minimal flow — 6-phase UI with SSE + all API calls, iteration revert endpoint                                                                  | `Studio.tsx`, `conversations.ts`                                                                   |
| J                  | Stale conversation marking — sibling conversations marked "stale" after execution                                                                     | `plans.ts`                                                                                         |
| N                  | Open design issues doc updated — 6 marked RESOLVED                                                                                                    | `docs/issues/open-design-issues.md`                                                                |

---

## Fix 1: State API routing bug

**Problem:** State routes are unreachable. `state.ts` defines routes with `/` + param name patterns (`/:guildId/state`) but is mounted at `/guilds/:guildId`, producing double-guildId URLs like `/api/guilds/123/123/state`.

**File:** `apps/server/src/hono/routes/state.ts`

**Change:** Remove `:guildId/` prefix from 3 route patterns:

```ts
// Before:
stateApp.get("/:guildId/state", ...)
stateApp.get("/:guildId/channels", ...)
stateApp.get("/:guildId/roles", ...)

// After:
stateApp.get("/state", ...)
stateApp.get("/channels", ...)
stateApp.get("/roles", ...)
```

The `guildId` is already available from the parent route mount `api.route("/guilds/:guildId", stateApp)` via `c.req.param("guildId")`.

**Verification:** `pnpm tsc --noEmit -p apps/server/tsconfig.json` should pass.

---

## Fix 2: Validation Stage 2 — LLM policy check

**Problem:** `validateWithLLM()` in `validation.ts:284-289` returns `[]`. The `rules` table has full CRUD but rules are never consumed. Server administrators can create rules but they have zero effect on planning.

**Design decision:** Use structured JSON response from LLM (Option A). Prompt the LLM to return `{ violations: [...] }` with `response_format: { type: "json_object" }`.

**File:** `apps/server/src/planning/validation.ts`

**What to add:**

### Step 1: Add imports at top of file

```ts
import { db, rules } from "@repo/db";
import { eq } from "drizzle-orm";
```

### Step 2: Replace the placeholder function (~line 284)

```ts
async function validateWithLLM(steps: PlanStep[], guildId: string): Promise<ValidationIssue[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return []; // Skip silently if no LLM configured

  // Load server rules for this guild
  const guildRules = await db.select().from(rules).where(eq(rules.guildId, guildId));

  if (guildRules.length === 0) return []; // No rules to check against

  // Build a text summary of the plan steps
  const planSummary = steps
    .map((step) => {
      const name = (step.params.name as string) ?? (step.params.id as string) ?? "";
      switch (step.toolName) {
        case "create_channel":
          return `Create channel "${name}" (${step.params.type})`;
        case "create_category":
          return `Create category "${name}"`;
        case "create_role":
          return `Create role "${name}"`;
        case "delete_channel":
        case "delete_category":
          return `Delete ${step.toolName.replace("delete_", "")} "${name}"`;
        case "delete_role":
          return `Delete role "${name}"`;
        case "edit_channel":
        case "edit_category":
        case "edit_role":
          return `Edit ${step.toolName.replace("edit_", "")} "${name}"`;
        case "set_overwrite":
          return `Set permission overwrite on ${step.params.channel_id} for ${step.params.role_id}`;
        case "remove_overwrite":
          return `Remove permission overwrite on ${step.params.channel_id} for ${step.params.role_id}`;
        case "move_channel":
        case "move_role":
          return `Move ${step.toolName.replace("move_", "")} "${name}"`;
        default:
          return step.toolName;
      }
    })
    .join("\n");

  if (!planSummary) return [];

  // Format rules as a numbered list
  const rulesText = guildRules.map((r, i) => `${i + 1}. ${r.ruleText}`).join("\n");

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.WEB_APP_URL ?? "http://localhost:5173",
        "X-Title": "Discord Platform",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a server rule compliance checker. " +
              "Given a proposed plan for changes to a Discord server and a list of server rules, " +
              "identify any violations. " +
              "Return ONLY a valid JSON object with this exact shape:\n" +
              '{ "violations": [{ "rule": string, "severity": "warning" | "block", "message": string }] }\n' +
              "If there are no violations, return { violations: [] }.",
          },
          {
            role: "user",
            content: `Server rules:\n${rulesText}\n\nProposed plan:\n${planSummary}`,
          },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      console.error("[validateWithLLM] OpenRouter error:", response.status);
      return [];
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as {
      violations?: Array<{
        rule: string;
        severity: string;
        message: string;
      }>;
    };

    return (parsed.violations ?? []).map((v) => ({
      group: "Stage 2: Policy",
      message: v.message,
      severity: (v.severity === "block" ? "block" : "warning") as ValidationSeverity,
    }));
  } catch (err) {
    console.error("[validateWithLLM] Failed:", err);
    return []; // Don't block execution if LLM call fails
  }
}
```

**Verification:** `pnpm lint && pnpm tsc --noEmit -p apps/server/tsconfig.json`

---

## Fix 3: Template → Studio merge endpoint

**Problem:** Templates have full CRUD (`templates.ts`) but there's no way to apply a template to a server. Design doc says LLM should compare template to current server state and generate a merge plan.

**Design decision:** Path B — LLM merge. Create a conversation with a well-crafted prompt including the template structure. The LLM adapts the template to the current server state. Reuses the existing conversation creation + PlanningSession flow.

**File:** `apps/server/src/hono/routes/templates.ts`

### Step 1: Add imports at top of file

```ts
import { hashServerState } from "@repo/shared";
import { conversations } from "@repo/db";
import { PlanningSession } from "../../planning/planning-session";
import {
  getSession,
  setSession,
  removeSession,
  setSessionTimeout,
  clearSessionTimeout,
} from "../../planning/session-manager";
import { emitConversationEvent } from "../../planning/planning-event-bus";
import { guildCache } from "../../bot/cache";
import { botClient } from "../../bot/client";
import type { ServerState } from "@repo/shared";
```

### Step 2: Add helper function (before the routes)

```ts
function buildServerState(guildId: string): ServerState {
  const cache = guildCache.get(guildId);
  const guild = botClient.guilds.cache.get(guildId);
  return {
    guildId,
    guildName: guild?.name ?? guildId,
    memberCount: guild?.memberCount ?? 0,
    channels: cache ? Array.from(cache.channels.values()) : [],
    roles: cache ? Array.from(cache.roles.values()) : [],
    overwrites: cache ? Array.from(cache.permissions.values()) : [],
  };
}
```

### Step 3: Add merge route before `export default templatesApp;`

```ts
templatesApp.post("/:templateId/merge", async (c) => {
  const user = c.get("user") as { id: string } | undefined;
  const guildId = c.req.param("guildId")!;
  const templateId = c.req.param("templateId")!;

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const hasAccess = await userHasManageGuild(user.id, guildId);
  if (!hasAccess) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Load template
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));

  if (!template) {
    return c.json({ error: "Template not found" }, 404);
  }

  // Build prompt from template data
  const structureText = JSON.stringify(template.structure, null, 2);
  const userPrompt =
    `Apply the "${template.name}" template to this server.\n\n` +
    `Template description: ${template.description}\n\n` +
    `Template structure:\n${structureText}\n\n` +
    "Instructions:\n" +
    "- Compare the template against the current server state\n" +
    "- Adapt the template: rename items if names conflict, skip items " +
    "that already exist with the right configuration\n" +
    "- Use ask_user if you need clarification about which existing " +
    "resources to reuse or rename\n" +
    "- Preserve the template's intent even if exact names differ";

  // Build server state and compute fork hash
  const serverState = buildServerState(guildId);
  const forkStateHash = hashServerState(serverState as unknown as Record<string, unknown>);

  // Insert conversation
  const [conversation] = await db
    .insert(conversations)
    .values({
      guildId,
      userId: user.id,
      status: "planning",
      userPrompt,
      messages: [],
      forkStateHash,
    })
    .returning();

  // Create planning session (same pattern as POST /conversations)
  const ASK_USER_TIMEOUT_MS = 2 * 60 * 1000;

  const session = new PlanningSession({
    guildId,
    conversationId: conversation.id,
    userPrompt,
    serverState,
    forkStateHash,
    emit: async (event) => {
      emitConversationEvent(conversation.id, event);

      if (event.type === "ask_user") {
        const timeout = setTimeout(async () => {
          const s = getSession(conversation.id);
          if (s) {
            s.cancel();
            removeSession(conversation.id);
            emitConversationEvent(conversation.id, {
              type: "expired",
              error: "Ask user response timed out after 2 minutes",
            });
            await db
              .update(conversations)
              .set({ status: "expired", updatedAt: new Date() })
              .where(eq(conversations.id, conversation.id));
          }
        }, ASK_USER_TIMEOUT_MS);
        setSessionTimeout(conversation.id, timeout);
      }

      if (event.type === "completed") {
        removeSession(conversation.id);
        await db
          .update(conversations)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }

      if (event.type === "error") {
        removeSession(conversation.id);
        await db
          .update(conversations)
          .set({ status: "error", updatedAt: new Date() })
          .where(eq(conversations.id, conversation.id));
      }
    },
    onTurnComplete: async (sess) => {
      // Import needed: planIterations
      const { planIterations } = await import("@repo/db");
      const snapshot = sess.store.snapshot();
      const version = sess.store.getState().version;

      await db.insert(planIterations).values({
        conversationId: conversation.id,
        version,
        type: "llm_generated",
        desiredState: snapshot as unknown as Record<string, unknown>,
      });

      sess.store.getState().version += 1;

      await db
        .update(conversations)
        .set({
          messages: sess.getMessages() as unknown as Record<string, unknown>[],
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
    },
  });

  setSession(conversation.id, session);

  session.start().catch((err) => {
    console.error("[templates] Planning session error:", err);
    removeSession(conversation.id);
  });

  return c.json({ conversationId: conversation.id }, 201);
});
```

Note: The `onTurnComplete` callback needs `planIterations` from `@repo/db`. If `planIterations` is already imported in the file, use it directly. Otherwise, add it to the imports from `@repo/db` at the top of the file.

### Step 4: Ensure `planIterations` is in the `@repo/db` import at top of file

Change:

```ts
import { db, templates } from "@repo/db";
```

To:

```ts
import { db, templates, conversations, planIterations } from "@repo/db";
```

Or use the dynamic import pattern shown in the `onTurnComplete` callback above.

**Verification:** `pnpm lint && pnpm tsc --noEmit -p apps/server/tsconfig.json`

---

## Fix 4: `.env.example` missing OpenRouter vars

**Problem:** `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are used by `PlanningSession.callLLM()` but not listed in `.env.example`.

**File:** `.env.example`

**Change:** Append these lines at the end of the file:

```
# OpenRouter (AI Planning)
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=openai/gpt-4o-mini
```

---

## Implementation order

All four fixes are independent and can be done in any order:

1. **Fix 1** (state routes) — 30 seconds, 3 edits
2. **Fix 4** (.env.example) — 10 seconds, 2 lines
3. **Fix 2** (LLM policy check) — 5 minutes, ~60 new lines in validation.ts
4. **Fix 3** (template merge) — 5 minutes, ~90 new lines in templates.ts

After each fix: `pnpm lint && pnpm tsc --noEmit -p apps/server/tsconfig.json`

---

## What remains after these fixes (deferred)

| Issue                      | Priority | Notes                                                                                 |
| -------------------------- | -------- | ------------------------------------------------------------------------------------- |
| Dashboard page             | Resolved | Retired in Studio consolidation. Rules CRUD moved to Studio `SettingsTab`; `/dashboard` redirects to `/studio` (`Dashboard.tsx` stashed) |
| Setup page                 | Resolved | Retired in Studio consolidation. `/setup` redirects to `/studio` (`Setup.tsx` stashed); guild picker handles bot-invite |
| Tests                      | Medium   | AGENTS.md has comprehensive strategy                                                  |
| Template browser UI        | Resolved | In-panel `TemplatesTab` browser (search, counts, Merge) + standalone `/templates/:guildId` page + editable structure in editor |
| System prompt architecture | Low      | Design issue #7 — guidance file loading into planning prompt. Deferred                |
| Plan optimizer             | Rejected | Design issue #10 — explicitly rejected by 4-layer prevention stack                    |
| Diff engine heuristics     | Rejected | Design issue #9 — explicitly rejected by "dumb and deterministic" principle           |

## Fix 5: System prompt — prevent LLM from asking for symbols it already has

**Problem:** The LLM sometimes asks the user for category IDs or symbols to use as `parent_id` in `create_channel`, even though the `create_category` tool already returned the symbol in its previous tool result. The LLM has the symbol in its own message history but doesn't use it.

**File:** `apps/server/src/planning/planning-session.ts` — system prompt (lines ~530-565)

**Change:** Add a rule to the system prompt in `buildSystemPrompt()`:

Add the following bullet after the existing bullet `"When creating channels inside a category, set parent_id to the category's symbol or ID."` (around line 537):

> If a `create_category` tool call returned a `symbol`, use that symbol as the `parent_id` for channels inside that category. Do NOT ask the user for category IDs or symbols — the symbol from the previous tool result IS the answer.

**Verification:** Start a conversation requesting a new category + channels inside it. The LLM should use the symbol from `create_category`'s result directly instead of asking the user.
