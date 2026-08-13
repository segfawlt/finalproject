import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { parseSseData } from "../lib/sse";
import type { ModelConfig, StudioModel } from "../components/studio/ModelSelector";
import { getDeploymentModelSelection } from "./conversation-model-config";

export interface TemplateTurn {
  id: string;
  prompt: string;
  status: string;
  summary?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface TemplateQuestion {
  question: string;
  options?: string[];
  multiSelect?: boolean;
  allowCustom?: boolean;
}

export interface TemplateAuthoringEvent {
  type: "tool_called" | "tool_result";
  toolName?: string;
  params?: unknown;
  result?: unknown;
}

export function useTemplateAuthoring(
  templateId: string | undefined,
  onTemplateChanged: () => void
) {
  const [turns, setTurns] = useState<TemplateTurn[]>([]);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "planning" | "waiting_for_user" | "error">("idle");
  const [question, setQuestion] = useState<TemplateQuestion | null>(null);
  const [events, setEvents] = useState<TemplateAuthoringEvent[]>([]);
  const [error, setError] = useState("");
  const [models, setModels] = useState<StudioModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const source = useRef<EventSource | null>(null);
  const changed = useRef(onTemplateChanged);
  changed.current = onTemplateChanged;

  const refresh = useCallback(async () => {
    if (!templateId) return;
    const response = await apiFetch(`/api/templates/${templateId}/turns`);
    if (!response.ok) throw new Error(`Failed to load authoring turns (${response.status})`);
    setTurns((await response.json()) as TemplateTurn[]);
  }, [templateId]);

  const close = useCallback(() => {
    source.current?.close();
    source.current = null;
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    );
    return close;
  }, [close, refresh]);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    apiFetch("/api/settings/models")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load models (${response.status})`);
        return (await response.json()) as { modelIds: string[]; models: StudioModel[] };
      })
      .then((settings) => {
        if (cancelled) return;
        const selection = getDeploymentModelSelection(settings, modelConfig);
        setModels(selection.models);
        setModelConfig(selection.modelConfig);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function listen(turnId: string) {
    close();
    const es = new EventSource(`/api/templates/${templateId}/turns/${turnId}/stream`);
    source.current = es;
    const terminal = (nextStatus: "idle" | "error" = "idle", nextError = "") => {
      es.close();
      source.current = null;
      setActiveTurnId(null);
      setQuestion(null);
      setStatus(nextStatus);
      if (nextError) setError(nextError);
      void refresh()
        .then(() => {
          if (nextStatus === "idle") changed.current();
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        });
    };
    es.addEventListener("tool_called", (event) => {
      const data = parseSseData<TemplateAuthoringEvent>(event);
      if (data) setEvents((current) => [...current, { ...data, type: "tool_called" }]);
    });
    es.addEventListener("tool_result", (event) => {
      const data = parseSseData<TemplateAuthoringEvent>(event);
      if (data) setEvents((current) => [...current, { ...data, type: "tool_result" }]);
    });
    es.addEventListener("ask_user", (event) => {
      const data = parseSseData<TemplateQuestion>(event);
      if (data) {
        setQuestion(data);
        setStatus("waiting_for_user");
      }
    });
    es.addEventListener("completed", () => terminal());
    es.addEventListener("cancelled", () => terminal());
    es.addEventListener("error", (event) => {
      const data = parseSseData<{ error?: string }>(event);
      setError(data?.error ?? "Template authoring failed");
      terminal("error", data?.error ?? "Template authoring failed");
    });
  }

  async function submit(prompt: string, selectedModelConfig = modelConfig) {
    if (!templateId || !prompt.trim()) return;
    close();
    setError("");
    setEvents([]);
    setQuestion(null);
    const response = await apiFetch(`/api/templates/${templateId}/turns`, {
      method: "POST",
      body: { prompt, ...(selectedModelConfig ? { modelConfig: selectedModelConfig } : {}) },
    });
    if (!response.ok) throw new Error(`Failed to start authoring (${response.status})`);
    const turn = (await response.json()) as { id: string };
    setActiveTurnId(turn.id);
    setStatus("planning");
    listen(turn.id);
  }

  async function answer(answerText: string) {
    if (!templateId || !activeTurnId) return;
    const response = await apiFetch(`/api/templates/${templateId}/turns/${activeTurnId}/answer`, {
      method: "POST",
      body: { answer: answerText },
    });
    if (!response.ok) throw new Error(`Failed to answer (${response.status})`);
    setQuestion(null);
    setStatus("planning");
  }

  async function cancel() {
    if (!templateId || !activeTurnId) return;
    const response = await apiFetch(`/api/templates/${templateId}/turns/${activeTurnId}/cancel`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`Failed to cancel (${response.status})`);
    close();
    setActiveTurnId(null);
    setStatus("idle");
    await refresh();
  }

  return {
    turns,
    activeTurnId,
    status,
    question,
    events,
    error,
    models,
    modelsLoading,
    modelConfig,
    setModelConfig,
    submit,
    answer,
    cancel,
  };
}
