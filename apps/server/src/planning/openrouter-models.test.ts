import { describe, expect, it, vi } from "vitest";
import { getOpenRouterModels } from "./openrouter-models";

const toolCapableModel = {
  id: "openai/gpt-4.1",
  name: "GPT-4.1",
  description: "A tool-capable model",
  supported_parameters: ["tools", "tool_choice", "reasoning"],
  reasoning: {
    supported_efforts: ["low", "high"],
    default_effort: "low",
    default_enabled: true,
    mandatory: false,
    supports_max_tokens: true,
    max_tokens: 8192,
  },
};

describe("getOpenRouterModels", () => {
  it("filters to tool-capable models, normalizes reasoning metadata, and caches results", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              toolCapableModel,
              {
                id: "openai/no-tool-choice",
                name: "No tool choice",
                description: "Missing tool choice support",
                supported_parameters: ["tools"],
              },
              {
                id: "openai/no-tools",
                name: "No tools",
                description: "Missing tools support",
                supported_parameters: ["tool_choice"],
              },
            ],
          })
        )
    );

    const options = {
      baseUrl: "https://openrouter.ai/api/v1/catalog-test",
      fetch: fetchMock,
    };

    await expect(getOpenRouterModels(options)).resolves.toEqual([
      {
        id: "openai/gpt-4.1",
        name: "GPT-4.1",
        description: "A tool-capable model",
        supportsTools: true,
        reasoning: {
          supportedEfforts: ["low", "high"],
          defaultEffort: "low",
          defaultEnabled: true,
          mandatory: false,
          supportsMaxTokens: true,
          maxTokens: 8192,
        },
      },
    ]);
    await expect(getOpenRouterModels(options)).resolves.toEqual([
      expect.objectContaining({ id: "openai/gpt-4.1" }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/catalog-test/models");
  });

  it("does not request a catalog for a non-OpenRouter base URL", async () => {
    const fetchMock = vi.fn();

    await expect(
      getOpenRouterModels({ baseUrl: "https://provider.example/v1", fetch: fetchMock })
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a successful malformed response without caching it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [toolCapableModel] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [toolCapableModel] })));
    const options = {
      baseUrl: "https://openrouter.ai/api/v1/malformed-response-test",
      fetch: fetchMock,
    };

    await expect(getOpenRouterModels(options)).rejects.toThrow("malformed response");
    await expect(getOpenRouterModels(options)).resolves.toEqual([
      expect.objectContaining({ id: "openai/gpt-4.1" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
