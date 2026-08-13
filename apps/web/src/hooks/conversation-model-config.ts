import { getDefaultModelConfig, type ModelConfig, type StudioModel } from "../components/studio/ModelSelector";

export interface DeploymentModelSettings {
  modelIds: string[];
  models: StudioModel[];
}

export function getDeploymentModelSelection(
  settings: DeploymentModelSettings,
  current: ModelConfig | null
): { models: StudioModel[]; modelConfig: ModelConfig | null } {
  const models = settings.modelIds.flatMap((modelId) => {
    const model = settings.models.find((candidate) => candidate.id === modelId);
    return model ? [model] : [];
  });
  const modelConfig = models.some((model) => model.id === current?.modelId)
    ? current
    : models[0]
      ? getDefaultModelConfig(models[0])
      : null;

  return { models, modelConfig };
}

export function createModelConfigSaveQueue() {
  let tail = Promise.resolve();
  let latest: Promise<unknown> = tail;

  function enqueue<T>(save: () => Promise<T>): Promise<T> {
    const operation = tail.then(save);
    tail = operation.then(() => undefined, () => undefined);
    latest = operation;
    void operation.catch(() => undefined);
    return operation;
  }

  return { enqueue, wait: () => latest };
}
