export interface ReasoningConfig {
  effort?: string;
  maxTokens?: number;
}

export interface ConversationModelConfig {
  modelId: string;
  reasoning?: ReasoningConfig;
}

export interface ReasoningMetadata {
  efforts?: string[];
  maxTokens?: number;
}

export interface ModelMetadata {
  id: string;
  reasoning?: ReasoningMetadata;
}

export function resolveConfiguredModels(
  persistedModels: readonly ModelMetadata[] | null | undefined,
  fallbackModelId: string
): ModelMetadata[] {
  return persistedModels?.length ? [...persistedModels] : [{ id: fallbackModelId }];
}

export function validateModelSelection(
  selection: ConversationModelConfig,
  configuredModels: readonly ModelMetadata[]
): ConversationModelConfig {
  const model = configuredModels.find(
    (configuredModel) => configuredModel.id === selection.modelId
  );
  if (!model) {
    throw new Error(`Model "${selection.modelId}" is not enabled for this deployment`);
  }

  const reasoning = selection.reasoning;
  if (!reasoning) return selection;

  if (reasoning.effort !== undefined && reasoning.maxTokens !== undefined) {
    throw new Error("A model selection cannot specify both reasoning effort and token budget");
  }

  if (reasoning.effort !== undefined && !model.reasoning?.efforts?.includes(reasoning.effort)) {
    throw new Error(
      `Model "${selection.modelId}" does not support reasoning effort "${reasoning.effort}"`
    );
  }

  if (reasoning.maxTokens !== undefined && model.reasoning?.maxTokens === undefined) {
    throw new Error(`Model "${selection.modelId}" does not support a reasoning token budget`);
  }

  if (
    reasoning.maxTokens !== undefined &&
    (!Number.isInteger(reasoning.maxTokens) || reasoning.maxTokens <= 0)
  ) {
    throw new Error("Reasoning token budget must be a positive integer");
  }

  if (
    reasoning.maxTokens !== undefined &&
    reasoning.maxTokens > (model.reasoning?.maxTokens ?? 0)
  ) {
    throw new Error(
      `Reasoning token budget exceeds the advertised maximum of ${model.reasoning?.maxTokens}`
    );
  }

  return selection;
}
