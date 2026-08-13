import { describe, expect, it } from "vitest";
import {
  resolveConfiguredModels,
  validateModelSelection,
  type ModelMetadata,
} from "./model-config";

const configuredModels: ModelMetadata[] = [
  {
    id: "deepseek/deepseek-v4-flash-0731",
    reasoning: { efforts: ["low", "high"] },
  },
  {
    id: "qwen/qwen3.7-flash",
    reasoning: { maxTokens: 8192 },
  },
];

describe("validateModelSelection", () => {
  it("accepts an allowlisted model and supported reasoning effort", () => {
    expect(
      validateModelSelection(
        { modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { effort: "high" } },
        configuredModels
      )
    ).toEqual({
      modelId: "deepseek/deepseek-v4-flash-0731",
      reasoning: { effort: "high" },
    });
  });

  it("rejects a model outside the deployment allowlist", () => {
    expect(() => validateModelSelection({ modelId: "other/model" }, configuredModels)).toThrow(
      "not enabled for this deployment"
    );
  });

  it("rejects an effort the selected model does not advertise", () => {
    expect(() =>
      validateModelSelection(
        { modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { effort: "medium" } },
        configuredModels
      )
    ).toThrow('does not support reasoning effort "medium"');
  });

  it("rejects a token budget for a model that does not support one", () => {
    expect(() =>
      validateModelSelection(
        { modelId: "deepseek/deepseek-v4-flash-0731", reasoning: { maxTokens: 1024 } },
        configuredModels
      )
    ).toThrow("does not support a reasoning token budget");
  });

  it("rejects a zero token budget", () => {
    expect(() =>
      validateModelSelection(
        { modelId: "qwen/qwen3.7-flash", reasoning: { maxTokens: 0 } },
        configuredModels
      )
    ).toThrow("must be a positive integer");
  });

  it("rejects a fractional token budget", () => {
    expect(() =>
      validateModelSelection(
        { modelId: "qwen/qwen3.7-flash", reasoning: { maxTokens: 1.5 } },
        configuredModels
      )
    ).toThrow("must be a positive integer");
  });

  it("rejects a token budget above the model's advertised maximum", () => {
    expect(() =>
      validateModelSelection(
        { modelId: "qwen/qwen3.7-flash", reasoning: { maxTokens: 8193 } },
        configuredModels
      )
    ).toThrow("exceeds the advertised maximum of 8192");
  });

  it("accepts a token budget at the model's advertised maximum", () => {
    expect(
      validateModelSelection(
        { modelId: "qwen/qwen3.7-flash", reasoning: { maxTokens: 8192 } },
        configuredModels
      )
    ).toEqual({
      modelId: "qwen/qwen3.7-flash",
      reasoning: { maxTokens: 8192 },
    });
  });

  it("rejects a selection that specifies both reasoning controls", () => {
    expect(() =>
      validateModelSelection(
        {
          modelId: "deepseek/deepseek-v4-flash-0731",
          reasoning: { effort: "high", maxTokens: 1024 },
        },
        configuredModels
      )
    ).toThrow("cannot specify both reasoning effort and token budget");
  });
});

describe("resolveConfiguredModels", () => {
  it("uses the fallback model when no deployment selection exists", () => {
    expect(resolveConfiguredModels(null, "openai/gpt-4o-mini")).toEqual([
      { id: "openai/gpt-4o-mini" },
    ]);
  });
});
