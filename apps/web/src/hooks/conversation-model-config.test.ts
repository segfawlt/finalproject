import { describe, expect, it, vi } from "vitest";
import type { ModelConfig, StudioModel } from "../components/studio/ModelSelector";
import {
  createModelConfigSaveQueue,
  getDeploymentModelSelection,
} from "./conversation-model-config";

const models: StudioModel[] = [
  { id: "catalog-first", name: "Catalog first", description: "", supportsTools: true },
  { id: "saved-first", name: "Saved first", description: "", supportsTools: true },
];

describe("getDeploymentModelSelection", () => {
  it("orders selectable models by persisted model IDs", () => {
    expect(
      getDeploymentModelSelection({ modelIds: ["saved-first", "catalog-first"], models }, null)
    ).toMatchObject({
      models: [{ id: "saved-first" }, { id: "catalog-first" }],
      modelConfig: { modelId: "saved-first" },
    });
  });

  it("resets a no-longer-allowed config to the first saved model", () => {
    expect(
      getDeploymentModelSelection(
        { modelIds: ["saved-first"], models },
        { modelId: "catalog-first" }
      ).modelConfig
    ).toEqual({ modelId: "saved-first" });
  });
});

describe("createModelConfigSaveQueue", () => {
  it("serializes updates and continues after a rejected write", async () => {
    let rejectFirst!: (reason?: unknown) => void;
    const first = new Promise<ModelConfig>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const save = vi
      .fn<(config: ModelConfig) => Promise<ModelConfig>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ modelId: "second" });
    const queue = createModelConfigSaveQueue();

    const firstSave = queue.enqueue(() => save({ modelId: "first" }));
    const secondSave = queue.enqueue(() => save({ modelId: "second" }));

    await Promise.resolve();
    expect(save).toHaveBeenCalledWith({ modelId: "first" });
    expect(save).toHaveBeenCalledTimes(1);

    rejectFirst(new Error("save failed"));
    await expect(firstSave).rejects.toThrow("save failed");
    await expect(secondSave).resolves.toEqual({ modelId: "second" });
    expect(save).toHaveBeenCalledTimes(2);
    await expect(queue.wait()).resolves.toEqual({ modelId: "second" });
  });

  it("reports a failed final write to next-turn actions", async () => {
    const queue = createModelConfigSaveQueue();
    void queue.enqueue(() => Promise.reject(new Error("save failed")));

    await expect(queue.wait()).rejects.toThrow("save failed");
  });
});
