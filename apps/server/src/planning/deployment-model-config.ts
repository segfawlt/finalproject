import { appSettings, db } from "@repo/db";
import { eq } from "drizzle-orm";
import { validatedEnv } from "../env-validated";
import { getOpenRouterModels } from "./openrouter-models";
import {
  resolveConfiguredModels,
  validateModelSelection,
  type ConversationModelConfig,
  type ModelMetadata,
} from "./model-config";

const MODEL_SETTINGS_KEY = "openrouter_models";

function readPersistedModelIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (
    !value.every((modelId): modelId is string => typeof modelId === "string" && modelId.length > 0)
  ) {
    return null;
  }
  return new Set(value).size === value.length ? value : null;
}

function toModelMetadata(model: {
  id: string;
  reasoning?: {
    supportedEfforts?: string[];
    supportsMaxTokens?: boolean;
    maxTokens?: number;
  };
}): ModelMetadata {
  return {
    id: model.id,
    reasoning: model.reasoning
      ? {
          efforts: model.reasoning.supportedEfforts,
          maxTokens: model.reasoning.supportsMaxTokens ? model.reasoning.maxTokens : undefined,
        }
      : undefined,
  };
}

export async function resolveDeploymentModelConfig(
  selection?: ConversationModelConfig
): Promise<ConversationModelConfig> {
  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MODEL_SETTINGS_KEY));
  const modelIds = readPersistedModelIds(setting?.value);
  if (selection && modelIds && !modelIds.includes(selection.modelId)) {
    throw new Error(`Model "${selection.modelId}" is not enabled for this deployment`);
  }

  let catalog: Awaited<ReturnType<typeof getOpenRouterModels>> = [];
  try {
    catalog = await getOpenRouterModels({
      baseUrl: validatedEnv.LLM_BASE_URL,
      apiKey: validatedEnv.LLM_API_KEY,
    });
  } catch {
    // Persisted model IDs remain usable when catalog metadata is unavailable.
  }

  const selectedCatalog = modelIds ? catalog.filter((model) => modelIds.includes(model.id)) : [];
  const models = resolveConfiguredModels(
    modelIds
      ? modelIds.map((modelId) => {
          const model = selectedCatalog.find((catalogModel) => catalogModel.id === modelId);
          return model ? toModelMetadata(model) : { id: modelId };
        })
      : [],
    validatedEnv.LLM_MODEL
  );
  const defaults = new Map(
    selectedCatalog.flatMap((model) =>
      model.reasoning?.defaultEnabled && model.reasoning.defaultEffort
        ? [[model.id, { effort: model.reasoning.defaultEffort }]]
        : []
    )
  );
  const selected = selection ?? {
    modelId: models[0].id,
    reasoning: defaults.get(models[0].id),
  };

  return validateModelSelection(selected, models);
}
