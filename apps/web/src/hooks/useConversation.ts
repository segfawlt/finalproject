import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { parseSseData } from "../lib/sse";
import { useStudioStore } from "../stores/studioStore";
import type { DesiredState, ServerState } from "../components/desired-state";
import { type ModelConfig, type StudioModel } from "../components/studio/ModelSelector";
import {
  createModelConfigSaveQueue,
  getDeploymentModelSelection,
  type DeploymentModelSettings,
} from "./conversation-model-config";

// ── Phase + event types ───────────────────────────────────────────────────

export type StudioPhase =
  | "input"
  | "planning"
  | "ask_user"
  | "completed"
  | "executing"
  | "executed"
  | "execute_failed";

export type IterationType = "llm_generated" | "manual_edit" | "revert";

export interface IterationRow {
  id: string;
  version: number;
  type: IterationType;
  desiredState: DesiredState;
  createdAt: string;
}

export interface PlanningEvent {
  type: "turn_started" | "tool_called" | "tool_result";
  toolName?: string;
  params?: unknown;
  result?: unknown;
}

export type ExecEvent =
  | { type: "step_started"; stepIndex?: number }
  | { type: "step_completed"; stepIndex?: number; result?: unknown }
  | { type: "step_failed"; stepIndex?: number; error?: string }
  | { type: "step_retry"; stepIndex?: number; error?: string }
  | { type: "rollback_started" }
  | { type: "rollback_completed" }
  | { type: "rollback_failed"; error?: string };

export interface AskUserData {
  question: string;
  options?: Array<{ label: string }>;
  multiSelect?: boolean;
  allowCustom?: boolean;
}

export interface ActiveTemplate {
  id: string;
  name: string;
}

export interface UseConversationArgs {
  guildId: string | undefined;
}

export interface UseConversationResult {
  // Lifecycle
  phase: StudioPhase;
  conversationId: string | null;
  planId: string | null;
  error: string;
  inFlight: boolean;
  canAIRepair: boolean;

  // User-authored prompt (for the revise textarea and as the fallback
  // for createConversation when no initial prompt is supplied)
  prompt: string;

  /** True when the server has changed since planning started.
   *  Set by useGuildDrift; gates the Approve action. */
  stale: boolean;

  // Planning data
  planningEvents: PlanningEvent[];
  askUserData: AskUserData | null;
  askUserSelected: string[];
  askUserCustom: string;
  summary: string;
  desiredState: DesiredState | null;
  iterations: IterationRow[];
  currentState: ServerState | null;

  // Execution data
  execEvents: ExecEvent[];

  // Templates
  activeTemplates: ActiveTemplate[];
  showTemplatePanel: boolean;

  // Model configuration
  models: StudioModel[];
  modelsLoading: boolean;
  modelConfig: ModelConfig | null;

  // Setters for child-controlled inputs (useState setters — accept value
  // or a functional updater, matching React's standard signature)
  setAskUserSelected: React.Dispatch<React.SetStateAction<string[]>>;
  setAskUserCustom: (v: string) => void;
  setActiveTemplates: React.Dispatch<React.SetStateAction<ActiveTemplate[]>>;
  setShowTemplatePanel: (v: boolean) => void;
  setPrompt: (v: string) => void;
  setError: (v: string) => void;
  updateModelConfig: (config: ModelConfig) => Promise<void>;
  updateDeploymentModels: (settings: DeploymentModelSettings) => Promise<void>;

  // Actions
  createConversation: (initialPrompt?: string) => Promise<void>;
  beginPlanning: (convId: string) => void;
  submitAskUser: () => Promise<void>;
  loadConversation: (convId: string) => Promise<void>;
  reset: () => void;
  cancelPlanning: () => Promise<void>;
  approve: () => Promise<void>;
  replanWithAI: () => Promise<void>;
  abortExecution: () => Promise<void>;
  rollback: () => Promise<void>;
  revise: (newPrompt: string) => Promise<void>;
  revert: (version: number) => Promise<void>;
  clearError: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Owns the conversation lifecycle for a single guild: planning SSE,
 * execution SSE, approve/rollback/revise/revert, in-flight guards, and
 * reset. Pure data layer — no rendering. The chat UI consumes the
 * returned state and dispatches actions.
 */
export function useConversation({ guildId }: UseConversationArgs): UseConversationResult {
  // State
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [phase, setPhase] = useState<StudioPhase>("input");
  const [error, setError] = useState("");
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([]);
  const [execEvents, setExecEvents] = useState<ExecEvent[]>([]);
  const [askUserData, setAskUserData] = useState<AskUserData | null>(null);
  const [askUserSelected, setAskUserSelected] = useState<string[]>([]);
  const [askUserCustom, setAskUserCustom] = useState("");
  const [summary, setSummary] = useState("");
  const [desiredState, setDesiredState] = useState<DesiredState | null>(null);
  const [iterations, setIterations] = useState<IterationRow[]>([]);
  const [currentState, setCurrentState] = useState<ServerState | null>(null);
  const [activeTemplates, setActiveTemplates] = useState<ActiveTemplate[]>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [canAIRepair, setCanAIRepair] = useState(false);
  const [models, setModels] = useState<StudioModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelConfig, setModelConfigState] = useState<ModelConfig | null>(null);
  const modelConfigRef = useRef<ModelConfig | null>(null);
  const setModelConfig = useCallback((config: ModelConfig | null) => {
    modelConfigRef.current = config;
    setModelConfigState(config);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    apiFetch("/api/settings/models")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
        return (await res.json()) as { modelIds: string[]; models: StudioModel[] };
      })
      .then((data) => {
        if (cancelled) return;
        const selection = getDeploymentModelSelection(data, modelConfigRef.current);
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
  }, [guildId]);

  // Refs
  const planningEsRef = useRef<EventSource | null>(null);
  const execEsRef = useRef<EventSource | null>(null);
  const esRefFailures = useRef(0);
  const inFlightRef = useRef(false);
  const askUserDataRef = useRef<AskUserData | null>(null);
  const modelConfigSaveQueueRef = useRef(createModelConfigSaveQueue());

  // Keep the ask_user mirror in sync so SSE error listeners (which
  // capture stale closures) can see the latest value mid-ask_user.
  useEffect(() => {
    askUserDataRef.current = askUserData;
  }, [askUserData]);

  // Close any open SSE streams when the component unmounts.
  useEffect(() => {
    return () => {
      planningEsRef.current?.close();
      execEsRef.current?.close();
    };
  }, []);

  // In-flight guard (mirrors state for child disabled-ness + ref for
  // synchronous re-entry checks across async boundaries).
  const enterInFlight = useCallback((): boolean => {
    if (inFlightRef.current) return true;
    inFlightRef.current = true;
    setInFlight(true);
    return false;
  }, []);
  const exitInFlight = useCallback(() => {
    inFlightRef.current = false;
    setInFlight(false);
  }, []);

  const clearError = useCallback(() => setError(""), []);
  const showError = useCallback((msg: string) => setError(msg), []);
  const setErrorExplicit = useCallback((msg: string) => setError(msg), []);

  // ── Planning SSE ─────────────────────────────────────────────────────
  const connectPlanningSSE = useCallback(
    (convId: string) => {
      planningEsRef.current?.close();

      const es = new EventSource(`/api/conversations/${convId}/stream`);
      planningEsRef.current = es;

      es.addEventListener("status", () => {
        /* streaming_ready — no-op */
      });

      es.addEventListener("turn_started", () => {
        setPlanningEvents((prev) => [...prev, { type: "turn_started" }]);
      });

      es.addEventListener("tool_called", (e) => {
        const data = parseSseData<{ toolName?: string; params?: unknown }>(e);
        if (!data) return;
        setPlanningEvents((prev) => [
          ...prev,
          { type: "tool_called", toolName: data.toolName, params: data.params },
        ]);
      });

      es.addEventListener("tool_result", (e) => {
        const data = parseSseData<{ toolName?: string; result?: unknown }>(e);
        if (!data) return;
        setPlanningEvents((prev) => [
          ...prev,
          { type: "tool_result", toolName: data.toolName, result: data.result },
        ]);
      });

      es.addEventListener("ask_user", (e) => {
        const data = parseSseData<AskUserData & { question?: string }>(e);
        if (!data) return;
        setAskUserData({
          question: data.question ?? "",
          options: data.options,
          multiSelect: data.multiSelect,
          allowCustom: data.allowCustom,
        });
        setAskUserSelected([]);
        setAskUserCustom("");
        setPhase("ask_user");
      });

      es.addEventListener("completed", async (e) => {
        const data = parseSseData<{ summary?: string }>(e);
        if (!data) return;
        setSummary(data.summary ?? "");
        planningEsRef.current?.close();
        planningEsRef.current = null;

        // Fetch conversation to get full iteration history + latest desiredState
        try {
          const res = await apiFetch(`/api/guilds/${guildId}/conversations/${convId}`);
          if (res.ok) {
            const convData = (await res.json()) as {
              iterations: IterationRow[];
              modelId?: string;
              reasoning?: ModelConfig["reasoning"];
            };
            if (convData.modelId) {
              setModelConfig({ modelId: convData.modelId, reasoning: convData.reasoning });
            }
            const iters = convData.iterations ?? [];
            setIterations(iters);
            const latest = iters.length > 0 ? iters[iters.length - 1] : null;
            if (latest) setDesiredState(latest.desiredState);
          }
        } catch {
          /* ignore — completed view can show what we have */
        }

        // Fetch current Discord state for the diff overlay (best-effort).
        setCurrentState(null);
        try {
          const stateRes = await apiFetch(`/api/guilds/${guildId}/state`);
          if (stateRes.ok) {
            setCurrentState((await stateRes.json()) as ServerState);
          }
        } catch {
          /* diff overlay just stays hidden */
        }

        setPhase("completed");
      });

      es.addEventListener("error", (e) => {
        const data = parseSseData<{ error?: string }>(e);
        showError(data?.error ?? "Planning error");
        planningEsRef.current?.close();
        planningEsRef.current = null;
        // If the user was mid-answer to an ask_user, keep that state so
        // they can retry instead of silently losing the question. Read
        // from the ref because the listener closure captured the
        // initial value.
        if (!askUserDataRef.current) {
          setPhase("input");
        } else {
          setPhase("ask_user");
        }
      });

      es.addEventListener("expired", (e) => {
        const data = parseSseData<{ error?: string }>(e);
        showError(data?.error ?? "Ask user response timed out");
        planningEsRef.current?.close();
        planningEsRef.current = null;
        setAskUserData(null);
        setAskUserSelected([]);
        setAskUserCustom("");
        setPhase("input");
      });
    },
    [guildId, showError]
  );

  // ── Execution SSE ────────────────────────────────────────────────────
  const connectExecSSE = useCallback(
    (pid: string) => {
      execEsRef.current?.close();
      esRefFailures.current = 0;

      const es = new EventSource(`/api/plan/${pid}/stream`);
      execEsRef.current = es;

      es.addEventListener("step_started", (e) => {
        const data = parseSseData<{ stepIndex?: number }>(e);
        if (!data) return;
        setExecEvents((prev) => [...prev, { type: "step_started", stepIndex: data.stepIndex }]);
      });

      es.addEventListener("step_completed", (e) => {
        const data = parseSseData<{ stepIndex?: number; result?: unknown }>(e);
        if (!data) return;
        setExecEvents((prev) => [
          ...prev,
          { type: "step_completed", stepIndex: data.stepIndex, result: data.result },
        ]);
      });

      es.addEventListener("step_failed", (e) => {
        const data = parseSseData<{ stepIndex?: number; error?: string }>(e);
        if (!data) return;
        setExecEvents((prev) => [
          ...prev,
          { type: "step_failed", stepIndex: data.stepIndex, error: data.error },
        ]);
      });

      es.addEventListener("plan_completed", () => {
        execEsRef.current?.close();
        execEsRef.current = null;
        setPhase("executed");
      });

      es.addEventListener("step_retry", (e) => {
        const data = parseSseData<{ stepIndex?: number; error?: string }>(e);
        if (!data) return;
        setExecEvents((prev) => [
          ...prev,
          { type: "step_retry", stepIndex: data.stepIndex, error: data.error },
        ]);
      });

      es.addEventListener("rollback_started", () => {
        setExecEvents((prev) => [...prev, { type: "rollback_started" }]);
      });

      es.addEventListener("rollback_completed", () => {
        setExecEvents((prev) => [...prev, { type: "rollback_completed" }]);
      });

      es.addEventListener("rollback_failed", (e) => {
        const data = parseSseData<{ error?: string }>(e);
        setExecEvents((prev) => [...prev, { type: "rollback_failed", error: data?.error }]);
      });

      es.addEventListener("plan_failed", (e) => {
        const data = parseSseData<{ error?: string }>(e);
        showError(data?.error || "Execution failed");
        execEsRef.current?.close();
        execEsRef.current = null;
        setPhase("completed");
      });

      es.onerror = () => {
        esRefFailures.current += 1;
        if (esRefFailures.current >= 3) {
          es.close();
          if (execEsRef.current === es) {
            execEsRef.current = null;
          }
          setPhase("completed");
          showError("Lost connection to execution stream");
        }
      };
    },
    [showError]
  );

  // ── Actions ──────────────────────────────────────────────────────────

  const createConversation = useCallback(
    async (initialPrompt?: string) => {
      const userPrompt = (initialPrompt ?? prompt).trim();
      if (!userPrompt) {
        showError("Enter a prompt first.");
        return;
      }
      if (enterInFlight()) return;
      try {
        clearError();
        setPlanningEvents([]);
        setAskUserData(null);
        setAskUserSelected([]);
        setAskUserCustom("");
        setSummary("");
        setDesiredState(null);
        setIterations([]);
        setCurrentState(null);
        setPrompt(userPrompt);

        try {
          const res = await apiFetch(`/api/guilds/${guildId}/conversations`, {
            method: "POST",
            body: {
              userPrompt,
              modelConfig: modelConfig ?? undefined,
              templateIds: activeTemplates.map((template) => template.id),
            },
          });
          if (!res.ok) {
            const data = (await res.json()) as { error: string };
            showError(data.error || `Failed to create conversation (${res.status})`);
            return;
          }
          const conv = (await res.json()) as { id: string };
          setConversationId(conv.id);
          setPhase("planning");
          // Open SSE immediately. The planning session starts on the
          // server as soon as the conversation is created, so events
          // emitted before this EventSource is attached are lost. LLM
          // turns take seconds, so the race window is narrow.
          connectPlanningSSE(conv.id);
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        exitInFlight();
      }
    },
    [
      guildId,
      prompt,
      modelConfig,
      activeTemplates,
      enterInFlight,
      exitInFlight,
      clearError,
      showError,
      connectPlanningSSE,
    ]
  );

  // Attach to a planning session the server already started, such as an AI
  // re-plan. Resets planning state and opens the SSE stream.
  const beginPlanning = useCallback(
    (convId: string) => {
      clearError();
      setPlanningEvents([]);
      setAskUserData(null);
      setAskUserSelected([]);
      setAskUserCustom("");
      setSummary("");
      setDesiredState(null);
      setIterations([]);
      setCurrentState(null);
      setConversationId(convId);
      setPhase("planning");
      connectPlanningSSE(convId);
    },
    [clearError, connectPlanningSSE]
  );

  const submitAskUser = useCallback(async () => {
    if (!conversationId) return;
    if (enterInFlight()) return;
    try {
      try {
        await modelConfigSaveQueueRef.current.wait();
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
        return;
      }
      const parts: string[] = [];
      if (askUserData?.multiSelect) {
        parts.push(...askUserSelected);
      } else if (askUserSelected.length > 0) {
        parts.push(askUserSelected[0]!);
      }
      if (askUserData?.allowCustom && askUserCustom.trim()) {
        parts.push(askUserCustom.trim());
      }
      const answer = parts.join(", ");
      if (!answer) return;
      clearError();

      try {
        const res = await apiFetch(
          `/api/guilds/${guildId}/conversations/${conversationId}/ask-user`,
          { method: "POST", body: { answer } }
        );
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          showError(data.error || "Failed to submit answer");
          return;
        }
        setAskUserData(null);
        setAskUserSelected([]);
        setAskUserCustom("");
        setPhase("planning");
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      exitInFlight();
    }
  }, [
    guildId,
    conversationId,
    askUserData,
    askUserSelected,
    askUserCustom,
    enterInFlight,
    exitInFlight,
    clearError,
    showError,
  ]);

  const loadConversation = useCallback(
    async (convId: string) => {
      if (enterInFlight()) return;
      try {
        planningEsRef.current?.close();
        planningEsRef.current = null;
        execEsRef.current?.close();
        execEsRef.current = null;

        setConversationId(convId);
        setPlanId(null);
        setPlanningEvents([]);
        setExecEvents([]);
        setAskUserData(null);
        setAskUserSelected([]);
        setAskUserCustom("");
        setPrompt("");
        setSummary("");
        setDesiredState(null);
        setIterations([]);
        setError("");
        setPhase("completed");
        setActiveTemplates([]);

        try {
          const res = await apiFetch(`/api/guilds/${guildId}/conversations/${convId}`);
          if (res.ok) {
            const convData = (await res.json()) as {
              userPrompt?: string;
              messages?: Array<{ role: string; content?: string }>;
              iterations: IterationRow[];
              modelId?: string;
              reasoning?: ModelConfig["reasoning"];
            };
            setPrompt(convData.userPrompt ?? "");
            const lastAssistantMessage = [...(convData.messages ?? [])]
              .reverse()
              .find((message) => message.role === "assistant" && message.content?.trim());
            setSummary(lastAssistantMessage?.content ?? "");
            if (convData.modelId) {
              setModelConfig({ modelId: convData.modelId, reasoning: convData.reasoning });
            }
            const iters = convData.iterations ?? [];
            setIterations(iters);
            const latest = iters.length > 0 ? iters[iters.length - 1] : null;
            if (latest) setDesiredState(latest.desiredState);
          } else {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            showError(data.error || `Failed to load conversation (${res.status})`);
          }
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        }

        setCurrentState(null);
        try {
          const stateRes = await apiFetch(`/api/guilds/${guildId}/state`);
          if (stateRes.ok) {
            setCurrentState((await stateRes.json()) as ServerState);
          }
        } catch {
          /* diff overlay just stays hidden */
        }
      } finally {
        exitInFlight();
      }
    },
    [guildId, enterInFlight, exitInFlight, showError]
  );

  const reset = useCallback(() => {
    planningEsRef.current?.close();
    planningEsRef.current = null;
    execEsRef.current?.close();
    execEsRef.current = null;
    setConversationId(null);
    setPlanId(null);
    setPlanningEvents([]);
    setExecEvents([]);
    setAskUserData(null);
    setAskUserSelected([]);
    setAskUserCustom("");
    setSummary("");
    setDesiredState(null);
    setIterations([]);
    setCurrentState(null);
    setError("");
    setCanAIRepair(false);
    setShowTemplatePanel(false);
    setActiveTemplates([]);
    setPhase("input");
  }, []);

  const cancelPlanning = useCallback(async () => {
    if (!conversationId) return;
    clearError();
    try {
      await apiFetch(`/api/guilds/${guildId}/conversations/${conversationId}/cancel`, {
        method: "POST",
      });
    } catch {
      /* ignore */
    }
    reset();
  }, [guildId, conversationId, clearError, reset]);

  const executePlan = useCallback(
    async (pid: string) => {
      setExecEvents([]);
      try {
        connectExecSSE(pid);
        setPhase("executing");

        const res = await apiFetch(`/api/guilds/${guildId}/plans/${pid}/execute`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = (await res.json()) as {
            error: string;
            conflicts?: string[];
            blockers?: { message: string }[];
            warnings?: { message: string }[];
            canAIRepair?: boolean;
          };
          const details = [
            ...(data.conflicts ?? []),
            ...(data.blockers?.map((b) => b.message) ?? []),
          ].join("\n");
          showError(details ? `${data.error}\n${details}` : data.error);
          execEsRef.current?.close();
          execEsRef.current = null;
          setPhase("execute_failed");
          setCanAIRepair(data.canAIRepair === true);
          return;
        }

        const data = (await res.json()) as { success: boolean; error?: string };
        if (!data.success) {
          showError(data.error || "Execution failed");
          execEsRef.current?.close();
          execEsRef.current = null;
          setPhase("execute_failed");
          return;
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
        execEsRef.current?.close();
        execEsRef.current = null;
        setPhase("execute_failed");
      }
    },
    [guildId, connectExecSSE, showError]
  );

  const approve = useCallback(async () => {
    if (!conversationId) return;
    if (enterInFlight()) return;
    try {
      clearError();
      try {
        const res = await apiFetch(
          `/api/guilds/${guildId}/conversations/${conversationId}/approve`,
          { method: "POST" }
        );
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          showError(data.error || "Failed to approve plan");
          return;
        }
        const data = (await res.json()) as { planId: string };
        setPlanId(data.planId);
        setPhase("executing");
        await executePlan(data.planId);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      exitInFlight();
    }
  }, [guildId, conversationId, enterInFlight, exitInFlight, clearError, showError, executePlan]);

  const replanWithAI = useCallback(async () => {
    if (!planId || !conversationId) return;
    if (enterInFlight()) return;
    try {
      clearError();
      const res = await apiFetch(`/api/guilds/${guildId}/plans/${planId}/replan`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showError(data.error || "Failed to start AI re-plan");
        return;
      }
      setCanAIRepair(false);
      beginPlanning(conversationId);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      exitInFlight();
    }
  }, [
    guildId,
    planId,
    conversationId,
    enterInFlight,
    exitInFlight,
    clearError,
    showError,
    beginPlanning,
  ]);

  const abortExecution = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/plans/${planId}/abort`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        showError(data.error || "Failed to abort execution");
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }, [guildId, planId, showError]);

  const rollback = useCallback(async () => {
    if (!planId) return;
    if (enterInFlight()) return;
    try {
      clearError();
      try {
        const res = await apiFetch(`/api/guilds/${guildId}/plans/${planId}/rollback`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          showError(data.error || "Rollback failed");
          return;
        }
        const data = (await res.json()) as { rolledBack: boolean; steps: number };
        if (data.rolledBack) {
          showError(`Rolled back ${data.steps} steps successfully.`);
        }
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      exitInFlight();
    }
  }, [guildId, planId, enterInFlight, exitInFlight, clearError, showError]);

  const revise = useCallback(
    async (newPrompt: string) => {
      if (!conversationId) return;
      if (!newPrompt.trim()) {
        showError("Enter a new prompt to revise.");
        return;
      }
      if (enterInFlight()) return;
      try {
        try {
          await modelConfigSaveQueueRef.current.wait();
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
          return;
        }
        clearError();
        setPlanningEvents([]);
        setSummary("");
        setDesiredState(null);
        setIterations([]);
        setCurrentState(null);

        try {
          const res = await apiFetch(
            `/api/guilds/${guildId}/conversations/${conversationId}/revise`,
            { method: "POST", body: { prompt: newPrompt.trim() } }
          );
          if (!res.ok) {
            const data = (await res.json()) as { error: string };
            showError(data.error || "Failed to revise");
            return;
          }
          setPhase("planning");
          connectPlanningSSE(conversationId);
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        exitInFlight();
      }
    },
    [
      guildId,
      conversationId,
      enterInFlight,
      exitInFlight,
      clearError,
      showError,
      connectPlanningSSE,
    ]
  );

  const revert = useCallback(
    async (version: number) => {
      if (!conversationId) return;
      if (enterInFlight()) return;
      try {
        clearError();
        try {
          const res = await apiFetch(
            `/api/guilds/${guildId}/conversations/${conversationId}/revert/${version}`,
            { method: "POST" }
          );
          if (!res.ok) {
            const data = (await res.json()) as { error: string };
            showError(data.error || "Revert failed");
            return;
          }
          const convRes = await apiFetch(`/api/guilds/${guildId}/conversations/${conversationId}`);
          if (convRes.ok) {
            const convData = (await convRes.json()) as { iterations: IterationRow[] };
            const iters = convData.iterations ?? [];
            setIterations(iters);
            const latest = iters.length > 0 ? iters[iters.length - 1] : null;
            if (latest) setDesiredState(latest.desiredState);
          }
        } catch (err) {
          showError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        exitInFlight();
      }
    },
    [guildId, conversationId, enterInFlight, exitInFlight, clearError, showError]
  );

  const stale = useStudioStore((s) => !!s.staleByGuild[guildId ?? ""]);

  const updateModelConfig = useCallback(
    async (config: ModelConfig) => {
      if (!conversationId) {
        setModelConfig(config);
        return;
      }

      try {
        await modelConfigSaveQueueRef.current.enqueue(async () => {
          const res = await apiFetch(
            `/api/guilds/${guildId}/conversations/${conversationId}/model-config`,
            { method: "PATCH", body: config }
          );
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error ?? `Failed to update model (${res.status})`);
          }
          const savedConfig = (await res.json()) as ModelConfig;
          setModelConfig(savedConfig);
          return savedConfig;
        });
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    },
    [guildId, conversationId, setModelConfig, showError]
  );

  const updateDeploymentModels = useCallback(
    async (settings: DeploymentModelSettings) => {
      const selection = getDeploymentModelSelection(settings, modelConfigRef.current);
      setModels(selection.models);
      if (!selection.modelConfig) return;

      const configChanged =
        selection.modelConfig.modelId !== modelConfigRef.current?.modelId ||
        selection.modelConfig.reasoning?.effort !== modelConfigRef.current?.reasoning?.effort ||
        selection.modelConfig.reasoning?.maxTokens !== modelConfigRef.current?.reasoning?.maxTokens;
      if (configChanged) await updateModelConfig(selection.modelConfig);
    },
    [updateModelConfig]
  );

  return {
    // Lifecycle
    phase,
    conversationId,
    planId,
    error,
    inFlight,
    canAIRepair,
    prompt,
    stale,
    // Planning
    planningEvents,
    askUserData,
    askUserSelected,
    askUserCustom,
    summary,
    desiredState,
    iterations,
    currentState,
    // Execution
    execEvents,
    // Templates
    activeTemplates,
    showTemplatePanel,
    models,
    modelsLoading,
    modelConfig,
    // Setters
    setAskUserSelected,
    setAskUserCustom,
    setActiveTemplates,
    setShowTemplatePanel,
    setPrompt,
    setError: setErrorExplicit,
    updateModelConfig,
    updateDeploymentModels,
    // Actions
    createConversation,
    beginPlanning,
    submitAskUser,
    loadConversation,
    reset,
    cancelPlanning,
    approve,
    replanWithAI,
    abortExecution,
    rollback,
    revise,
    revert,
    clearError,
  };
}
