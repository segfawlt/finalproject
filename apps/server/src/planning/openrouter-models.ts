const CACHE_TTL_MS = 10 * 60 * 1000;

export interface OpenRouterReasoningMetadata {
  supportedEfforts?: string[];
  defaultEffort?: string;
  defaultEnabled?: boolean;
  mandatory?: boolean;
  supportsMaxTokens?: boolean;
  maxTokens?: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  supportsTools: boolean;
  reasoning?: OpenRouterReasoningMetadata;
}

interface OpenRouterModelsOptions {
  baseUrl: string;
  apiKey?: string | null;
  fetch?: typeof fetch;
}

interface CachedModels {
  expiresAt: number;
  models: OpenRouterModel[];
}

const modelCache = new Map<string, CachedModels>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "openrouter.ai";
  } catch {
    return false;
  }
}

function getModelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

function normalizeReasoning(value: unknown): OpenRouterReasoningMetadata | undefined {
  if (!isRecord(value)) return undefined;

  const reasoning: OpenRouterReasoningMetadata = {};
  if (Array.isArray(value.supported_efforts)) {
    reasoning.supportedEfforts = value.supported_efforts.filter(
      (effort): effort is string => typeof effort === "string"
    );
  }
  if (typeof value.default_effort === "string") reasoning.defaultEffort = value.default_effort;
  if (typeof value.default_enabled === "boolean") reasoning.defaultEnabled = value.default_enabled;
  if (typeof value.mandatory === "boolean") reasoning.mandatory = value.mandatory;
  if (typeof value.supports_max_tokens === "boolean") {
    reasoning.supportsMaxTokens = value.supports_max_tokens;
  }
  if (typeof value.max_tokens === "number") reasoning.maxTokens = value.max_tokens;

  return Object.keys(reasoning).length ? reasoning : undefined;
}

function normalizeModel(value: unknown): OpenRouterModel | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const supportedParameters = Array.isArray(value.supported_parameters)
    ? value.supported_parameters
    : [];
  const supportsTools =
    supportedParameters.includes("tools") && supportedParameters.includes("tool_choice");
  if (!supportsTools) return null;

  const model: OpenRouterModel = {
    id: value.id,
    name: typeof value.name === "string" ? value.name : value.id,
    description: typeof value.description === "string" ? value.description : "",
    supportsTools,
  };
  const reasoning = normalizeReasoning(value.reasoning);
  if (reasoning) model.reasoning = reasoning;
  return model;
}

export async function getOpenRouterModels({
  baseUrl,
  apiKey,
  fetch: fetchImpl = fetch,
}: OpenRouterModelsOptions): Promise<OpenRouterModel[]> {
  if (!isOpenRouterBaseUrl(baseUrl)) return [];

  const cached = modelCache.get(baseUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.models;

  const url = getModelsUrl(baseUrl);
  const response = apiKey
    ? await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    : await fetchImpl(url);
  if (!response.ok) throw new Error(`OpenRouter model catalog request failed (${response.status})`);

  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error("OpenRouter model catalog returned a malformed response");
  }
  const models = body.data;
  const normalized = models
    .map(normalizeModel)
    .filter((model): model is OpenRouterModel => model !== null);

  modelCache.set(baseUrl, { models: normalized, expiresAt: Date.now() + CACHE_TTL_MS });
  return normalized;
}
