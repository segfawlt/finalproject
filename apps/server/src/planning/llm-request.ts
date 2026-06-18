export interface LLMRequestInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: unknown[];
  functions: unknown[];
  webAppUrl?: string;
  abortSignal?: AbortSignal;
}

export interface LLMRequest {
  url: string;
  fetchOptions: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  };
}

/**
 * Build a fetch request for any OpenAI-compatible chat completions API.
 *
 * Sends OpenRouter-specific headers (HTTP-Referer, X-Title) only when the
 * base URL points at openrouter.ai, so requests to other OpenAI-compatible
 * providers stay clean.
 */
export function buildLLMRequest(input: LLMRequestInput): LLMRequest {
  const trimmedBase = input.baseUrl.replace(/\/+$/, "");
  const url = `${trimmedBase}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${input.apiKey}`,
  };

  if (input.baseUrl.includes("openrouter.ai") && input.webAppUrl) {
    headers["HTTP-Referer"] = input.webAppUrl;
    headers["X-Title"] = "Discord Platform";
  }

  return {
    url,
    fetchOptions: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        tools: input.functions,
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 4096,
        stream: true,
      }),
      signal: input.abortSignal,
    },
  };
}
