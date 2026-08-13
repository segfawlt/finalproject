# OpenRouter Model Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the deployment owner select up to two OpenRouter tool-capable models in a Studio settings modal and let each conversation switch model and supported reasoning options on its next LLM turn.

**Architecture:** A new deployment-settings record persists the two-model allowlist while a server-side catalog service caches OpenRouter model metadata. Conversations persist their active model and reasoning configuration; `PlanningSession` resolves them for every outbound LLM turn. The stream parser buffers a complete assistant response, including reasoning blocks, before dispatching tools and removes model-specific reasoning blocks when a later turn switches models.

**Tech Stack:** TypeScript, Hono, Drizzle/PostgreSQL, React, Zustand, Tailwind CSS, Vitest, OpenRouter chat-completions API.

---

### Task 1: Persist deployment and conversation model configuration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/0011_openrouter_model_settings.sql`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Test: `apps/server/src/planning/model-config.test.ts`

- [ ] **Step 1: Write the failing model-configuration tests**

```ts
describe("validateModelSelection", () => {
  it("accepts an allowlisted model and supported reasoning effort", () => {
    expect(
      validateModelSelection(
        { modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { effort: "high" } },
        configuredModels,
      ),
    ).toEqual({ modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { effort: "high" } });
  });

  it("rejects a model outside the deployment allowlist", () => {
    expect(() => validateModelSelection({ modelId: "other/model" }, configuredModels)).toThrow(
      "not enabled for this deployment",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/model-config.test.ts`

Expected: FAIL because `model-config.ts` and `validateModelSelection` do not exist.

- [ ] **Step 3: Add database fields and minimal configuration types**

```ts
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// conversations
modelId: text("model_id"),
reasoning: jsonb("reasoning"),
```

Create migration SQL for `app_settings` and the nullable `conversations.model_id` and
`conversations.reasoning` columns. Add `apps/server/src/planning/model-config.ts` with the
`ReasoningConfig`, `ConversationModelConfig`, and allowlist validation used by routes and
planning. When no deployment record exists, expose the existing `LLM_MODEL` as the single
backward-compatible configured model.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/model-config.test.ts`

Expected: PASS.

### Task 2: Add authenticated OpenRouter catalog and deployment-model routes

**Files:**
- Create: `apps/server/src/planning/openrouter-models.ts`
- Create: `apps/server/src/hono/routes/settings.ts`
- Modify: `apps/server/src/hono/app.ts`
- Test: `apps/server/src/planning/openrouter-models.test.ts`
- Test: `apps/server/src/hono/routes/settings.test.ts`

- [ ] **Step 1: Write failing catalog tests**

```ts
it("returns only tool-capable models and caches the OpenRouter response", async () => {
  const first = await getOpenRouterModels(fetchMock);
  const second = await getOpenRouterModels(fetchMock);

  expect(first).toEqual([toolCapableModel]);
  expect(second).toEqual([toolCapableModel]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the catalog test to verify it fails**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/openrouter-models.test.ts`

Expected: FAIL because `getOpenRouterModels` does not exist.

- [ ] **Step 3: Implement catalog caching and routes**

```ts
settingsApp.get("/models", async (c) => {
  requireUser(c);
  return c.json(await getModelSettings());
});

settingsApp.put("/models", zValidator("json", z.object({ modelIds: z.array(z.string()).min(1).max(2) })), async (c) => {
  requireUser(c);
  const { modelIds } = c.req.valid("json");
  return c.json(await saveModelSettings(modelIds));
});
```

Fetch `${LLM_BASE_URL}/models` only for OpenRouter endpoints, retain an in-memory ten-minute
cache, normalize `id`, `name`, `description`, tool support, and the OpenRouter `reasoning`
metadata. Reject non-unique IDs, more than two IDs, missing catalog records, and records without
both `tools` and `tool_choice`. Mount the new route as `/api/settings`.

- [ ] **Step 4: Run catalog and route tests to verify they pass**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/openrouter-models.test.ts apps/server/src/hono/routes/settings.test.ts`

Expected: PASS.

### Task 3: Store and update a conversation's selected model

**Files:**
- Modify: `apps/server/src/hono/routes/conversations.ts`
- Modify: `apps/server/src/hono/routes/plans.ts`
- Test: `apps/server/src/hono/routes/conversations.test.ts`
- Test: `apps/server/src/planning/policy-validation.test.ts`

- [ ] **Step 1: Write failing route and policy tests**

```ts
it("persists a valid model selection when a conversation is created", async () => {
  const response = await app.request("/api/guilds/guild-1/conversations", {
    method: "POST",
    body: JSON.stringify({
      userPrompt: "Create a staff channel",
      modelConfig: { modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { effort: "high" } },
    }),
  });

  expect(response.status).toBe(201);
  expect(insertedConversation.modelId).toBe("deepseek/deepseek-v4-flash-0731");
});

it("uses the conversation model for rule validation", async () => {
  await validatePlan({ ...validPlan, modelConfig: { modelId: "qwen/qwen3.7-flash" } });
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    body: expect.stringContaining('"model":"qwen/qwen3.7-flash"'),
  }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/hono/routes/conversations.test.ts apps/server/src/planning/policy-validation.test.ts`

Expected: FAIL because creation, update, and policy validation do not accept `modelConfig`.

- [ ] **Step 3: Implement create/update and verification behavior**

Add `modelConfig` to the create schema, default it from deployment settings, and persist it on the
conversation. Add `PATCH /:convId/model-config`; it validates the selected model against the
current deployment allowlist, persists it, and does not cancel an in-flight request. Pass the
conversation configuration to `validatePlan` at execution time so policy verification uses the
currently selected model and reasoning option.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/hono/routes/conversations.test.ts apps/server/src/planning/policy-validation.test.ts`

Expected: PASS.

### Task 4: Buffer complete LLM responses and preserve compatible reasoning

**Files:**
- Modify: `apps/server/src/planning/stream-parser.ts`
- Modify: `apps/server/src/planning/planning-session.ts`
- Modify: `apps/server/src/planning/llm-request.ts`
- Test: `apps/server/src/planning/stream-parser.test.ts`
- Test: `apps/server/src/planning/planning-session.test.ts`
- Test: `apps/server/src/planning/llm-request.test.ts`

- [ ] **Step 1: Write failing streaming and session tests**

```ts
it("preserves streamed reasoning details alongside tool calls", async () => {
  const result = await parseOpenRouterStream(createStream([
    { choices: [{ delta: { reasoning_details: [{ index: 0, type: "reasoning.text", text: "Inspect " }] } }] },
    { choices: [{ delta: { reasoning_details: [{ index: 0, type: "reasoning.text", text: "channels" }] } }] },
  ]));

  expect(result.reasoningDetails).toEqual([{ index: 0, type: "reasoning.text", text: "Inspect channels" }]);
});

it("does not dispatch a streamed tool until the assistant response is complete", async () => {
  await session.start();
  expect(dispatchTool).toHaveBeenCalledAfter(streamFinished);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/stream-parser.test.ts apps/server/src/planning/planning-session.test.ts apps/server/src/planning/llm-request.test.ts`

Expected: FAIL because the parser drops `reasoning_details` and the session dispatches tools during streaming.

- [ ] **Step 3: Implement complete-response buffering and model-safe history**

```ts
const response = await this.callLLM();
this.messages.push(response);

for (const toolCall of response.tool_calls ?? []) {
  const result = await this.dispatchTool(toolCall);
  this.messages.push({ role: "tool", content: JSON.stringify(result.result), tool_call_id: toolCall.id });
}
```

Extend `LLMMessage` with `modelId`, `reasoning`, and `reasoning_details`. The parser accumulates
normal content separately from structured reasoning details and returns all tool calls only after
the stream ends. `callLLM` resolves the persisted configuration at the beginning of each turn,
adds its normalized `reasoning` object to the request, and marks the returned assistant message
with that model ID. When the next selected model differs, send a copy of prior messages with only
their reasoning fields removed; retain tool calls, tool results, and visible content.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/stream-parser.test.ts apps/server/src/planning/planning-session.test.ts apps/server/src/planning/llm-request.test.ts`

Expected: PASS.

### Task 5: Replace the settings tab with a modal and add chat controls

**Files:**
- Create: `apps/web/src/components/studio/SettingsDialog.tsx`
- Create: `apps/web/src/components/studio/ModelSelector.tsx`
- Modify: `apps/web/src/routes/Studio.tsx`
- Modify: `apps/web/src/components/studio/StudioHeader.tsx`
- Modify: `apps/web/src/components/studio/RightPanel.tsx`
- Modify: `apps/web/src/components/studio/ChatArea.tsx`
- Modify: `apps/web/src/components/studio/WelcomeScreen.tsx`
- Modify: `apps/web/src/hooks/useConversation.ts`
- Modify: `apps/web/src/stores/studioStore.ts`

- [ ] **Step 1: Write the failing model-control helper test**

```ts
it("removes reasoning controls for models without advertised reasoning support", () => {
  expect(getReasoningControls({ id: "model-a" })).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/web/src/components/studio/ModelSelector.test.ts`

Expected: FAIL because `ModelSelector` and `getReasoningControls` do not exist.

- [ ] **Step 3: Implement the modal and selectors**

```tsx
{open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
    <section className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border border-shell-border bg-shell-surface" onMouseDown={(event) => event.stopPropagation()}>
      <SettingsDialogContent />
    </section>
  </div>
)}
```

Move the current server-rule UI into `SettingsDialog`. Add a searchable OpenRouter model list with
selection capped at two and a save action. Remove the Settings tab type and its right-panel entry.
Fetch deployment settings in `useConversation`; send the selection on create and patch it whenever
the chat selector changes. Render the compact selector before creating a plan and in the active chat
toolbar. Show every advertised effort level or a numeric token budget as supplied by model metadata;
render a disabled “Reasoning unavailable” state when the model exposes no reasoning capability.

- [ ] **Step 4: Run the model-control test to verify it passes**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/web/src/components/studio/ModelSelector.test.ts`

Expected: PASS.

### Task 6: Verify and document the finished feature

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec dotenv -e .env -- pnpm vitest run apps/server/src/planning/model-config.test.ts apps/server/src/planning/openrouter-models.test.ts apps/server/src/hono/routes/settings.test.ts apps/server/src/hono/routes/conversations.test.ts apps/server/src/planning/stream-parser.test.ts apps/server/src/planning/planning-session.test.ts apps/server/src/planning/policy-validation.test.ts apps/web/src/components/studio/ModelSelector.test.ts`

Expected: PASS.

- [ ] **Step 2: Run workspace verification**

Run: `pnpm exec dotenv -e .env -- pnpm test:run && pnpm typecheck && pnpm lint && pnpm format:check`

Expected: all commands exit 0.

- [ ] **Step 3: Update implementation status**

Document the new deployment-wide OpenRouter model catalog/allowlist, per-conversation next-turn
model and reasoning configuration, buffered tool dispatch, and Settings modal. Bump the date and
move no unrelated gaps.
