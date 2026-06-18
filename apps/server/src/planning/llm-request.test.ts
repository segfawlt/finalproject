import { describe, it, expect } from "vitest";
import { buildLLMRequest, type LLMRequestInput } from "./llm-request";

const baseInput: LLMRequestInput = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "test-key",
  model: "some-model",
  messages: [{ role: "user", content: "hi" }],
  functions: [],
  webAppUrl: "http://localhost:5173",
};

describe("buildLLMRequest", () => {
  it("appends /chat/completions to a base URL without trailing slash", () => {
    const result = buildLLMRequest(baseInput);
    expect(result.url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("strips trailing slashes from the base URL before appending the path", () => {
    const result = buildLLMRequest({ ...baseInput, baseUrl: "https://api.example.com/v1///" });
    expect(result.url).toBe("https://api.example.com/v1/chat/completions");
  });

  it("sends only the standard headers when the base URL is not OpenRouter", () => {
    const result = buildLLMRequest(baseInput);

    expect(result.fetchOptions.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    });
  });

  it("adds OpenRouter-specific headers when the base URL points at OpenRouter", () => {
    const result = buildLLMRequest({
      ...baseInput,
      baseUrl: "https://openrouter.ai/api/v1",
    });

    expect(result.fetchOptions.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "Discord Platform",
    });
  });

  it("omits HTTP-Referer when the OpenRouter URL is used but no webAppUrl is provided", () => {
    const result = buildLLMRequest({
      ...baseInput,
      baseUrl: "https://openrouter.ai/api/v1",
      webAppUrl: undefined,
    });

    const headers = result.fetchOptions.headers as Record<string, string>;
    expect(headers["HTTP-Referer"]).toBeUndefined();
    expect(headers["X-Title"]).toBeUndefined();
  });

  it("encodes the request body with the OpenAI chat/completions schema", () => {
    const result = buildLLMRequest({
      ...baseInput,
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      functions: [{ name: "foo", parameters: {} }],
    });

    const body = JSON.parse(result.fetchOptions.body as string);
    expect(body).toEqual({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "foo", parameters: {} }],
      tool_choice: "auto",
      temperature: 0.1,
      max_tokens: 4096,
      stream: true,
    });
  });
});
