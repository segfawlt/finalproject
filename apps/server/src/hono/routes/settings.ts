import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db, appSettings } from "@repo/db";
import { eq } from "drizzle-orm";
import { requireUser } from "../../auth/middleware";
import { validatedEnv } from "../../env-validated";
import { getOpenRouterModels, type OpenRouterModel } from "../../planning/openrouter-models";
import type { AppVariables } from "../../types";

const MODEL_SETTINGS_KEY = "openrouter_models";

const modelIdsSchema = z.object({
  modelIds: z
    .array(z.string().min(1))
    .min(1)
    .max(2)
    .refine((modelIds) => new Set(modelIds).size === modelIds.length, {
      message: "Model IDs must be unique",
    }),
});

const settingsApp = new Hono<{ Variables: AppVariables }>();

function readPersistedModelIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  if (
    !value.every((modelId): modelId is string => typeof modelId === "string" && modelId.length > 0)
  ) {
    return null;
  }
  return new Set(value).size === value.length ? value : null;
}

function fallbackModel(modelId: string): OpenRouterModel {
  return { id: modelId, name: modelId, description: "", supportsTools: true };
}

async function getCatalog(): Promise<OpenRouterModel[]> {
  try {
    return await getOpenRouterModels({
      baseUrl: validatedEnv.LLM_BASE_URL,
      apiKey: validatedEnv.LLM_API_KEY,
    });
  } catch {
    return [];
  }
}

settingsApp.get("/models", async (c) => {
  requireUser(c);
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MODEL_SETTINGS_KEY));
  const modelIds = readPersistedModelIds(setting?.value) ?? [validatedEnv.LLM_MODEL];
  const catalog = await getCatalog();

  return c.json({
    modelIds,
    models: catalog.length ? catalog : modelIds.map(fallbackModel),
  });
});

settingsApp.put("/models", zValidator("json", modelIdsSchema), async (c) => {
  requireUser(c);
  const { modelIds } = c.req.valid("json");
  const catalog = await getCatalog();
  const selectedModels = modelIds.map((modelId) =>
    catalog.find((model) => model.id === modelId && model.supportsTools)
  );

  if (selectedModels.some((model) => !model)) {
    return c.json(
      { error: "Every selected model must be in the current tool-capable catalog" },
      400
    );
  }

  await db
    .insert(appSettings)
    .values({ key: MODEL_SETTINGS_KEY, value: modelIds })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: modelIds, updatedAt: new Date() },
    });

  return c.json({ modelIds, models: selectedModels });
});

export default settingsApp;
