import { useParams } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import ProcedureSidebar, { type PhaseProgress } from "../components/ProcedureSidebar";

type Phase = "input" | "planning" | "ask_user" | "completed" | "executing" | "executed";

interface PlanningEvent {
  type: string;
  toolName?: string;
  params?: unknown;
  result?: unknown;
  question?: string;
  options?: { label: string }[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  summary?: string;
  error?: string;
}

interface ExecEvent {
  type: string;
  stepIndex?: number;
  error?: string;
  result?: Record<string, unknown>;
}

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();

  // ── Phase & IDs ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("input");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  // ── Input ──────────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");

  // ── Planning ─────────────────────────────────────────────────────────────
  const [planningEvents, setPlanningEvents] = useState<PlanningEvent[]>([]);
  const [askUserData, setAskUserData] = useState<{
    question: string;
    options?: { label: string }[];
    multiSelect?: boolean;
    allowCustom?: boolean;
  } | null>(null);
  const [askUserAnswer, setAskUserAnswer] = useState("");

  // ── Completed ────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState("");
  const [desiredState, setDesiredState] = useState<unknown>(null);

  // ── Execution ────────────────────────────────────────────────────────────
  const [execEvents, setExecEvents] = useState<ExecEvent[]>([]);

  // ── Error ────────────────────────────────────────────────────────────────
  const [error, setError] = useState("");

  // ── Sidebar / Phase Progress ──────────────────────────────────────────────
  const [phaseProgress, setPhaseProgress] = useState<PhaseProgress>({
    foundation: false,
    layout: false,
    access: false,
    people: false,
  });
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);

  // ── SSE refs ─────────────────────────────────────────────────────────────
  const planningEsRef = useRef<EventSource | null>(null);
  const execEsRef = useRef<EventSource | null>(null);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      planningEsRef.current?.close();
      execEsRef.current?.close();
    };
  }, []);

  // ── Fetch guild phase progress ────────────────────────────────────────────
  useEffect(() => {
    if (!guildId) return;
    fetch(`/api/guilds/${guildId}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data: { phaseProgress?: PhaseProgress }) => {
        if (data.phaseProgress) {
          setPhaseProgress(data.phaseProgress);
        }
      })
      .catch(() => {});
  }, [guildId]);

  const updatePhaseProgress = useCallback(
    async (progress: PhaseProgress) => {
      if (!guildId) return;
      try {
        await fetch(`/api/guilds/${guildId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phaseProgress: progress }),
        });
      } catch {
        // silent
      }
    },
    [guildId]
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  function clearError() {
    setError("");
  }

  function showError(msg: string) {
    setError(msg);
  }

  // ── Sidebar scoped prompt ────────────────────────────────────────────────
  const pendingPhaseRef = useRef<string | null>(null);

  async function handleSidebarSendPrompt(phasePrompt: string, phase: string) {
    clearError();
    setPlanningEvents([]);
    setAskUserData(null);
    setAskUserAnswer("");
    setSummary("");
    setDesiredState(null);
    pendingPhaseRef.current = phase;
    setPrompt(phasePrompt);

    try {
      const res = await fetch(`/api/guilds/${guildId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userPrompt: phasePrompt }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showError(data.error || `Failed to create conversation (${res.status})`);
        return;
      }

      const conv = (await res.json()) as { id: string };
      setConversationId(conv.id);
      setPhase("planning");
      // Open SSE immediately. The planning session starts on the server as
      // soon as the conversation is created, so events emitted before this
      // EventSource is attached are lost. LLM turns take seconds, so the
      // race window is narrow. A future improvement could add a
      // /conversations/:id/state endpoint to replay current status on connect.
      connectPlanningSSE(conv.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Phase 1: Create conversation & start planning ────────────────────────
  async function createConversation() {
    if (!prompt.trim()) {
      showError("Enter a prompt first.");
      return;
    }
    clearError();
    setPlanningEvents([]);
    setAskUserData(null);
    setAskUserAnswer("");
    setSummary("");
    setDesiredState(null);

    try {
      const res = await fetch(`/api/guilds/${guildId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userPrompt: prompt }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showError(data.error || `Failed to create conversation (${res.status})`);
        return;
      }

      const conv = (await res.json()) as { id: string };
      setConversationId(conv.id);
      setPhase("planning");
      // Open SSE immediately. The planning session starts on the server as
      // soon as the conversation is created, so events emitted before this
      // EventSource is attached are lost. LLM turns take seconds, so the
      // race window is narrow. A future improvement could add a
      // /conversations/:id/state endpoint to replay current status on connect.
      connectPlanningSSE(conv.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Phase 2: Planning SSE ────────────────────────────────────────────────
  function connectPlanningSSE(convId: string) {
    planningEsRef.current?.close();

    const es = new EventSource(`/api/conversations/${convId}/stream`);
    planningEsRef.current = es;

    es.addEventListener("status", () => {
      // streaming_ready — nothing to do
    });

    es.addEventListener("turn_started", () => {
      setPlanningEvents((prev) => [...prev, { type: "turn_started" }]);
    });

    es.addEventListener("tool_called", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      setPlanningEvents((prev) => [
        ...prev,
        { type: "tool_called", toolName: data.toolName, params: data.params },
      ]);
    });

    es.addEventListener("tool_result", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      setPlanningEvents((prev) => [
        ...prev,
        { type: "tool_result", toolName: data.toolName, result: data.result },
      ]);
    });

    es.addEventListener("ask_user", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      setAskUserData({
        question: data.question ?? "",
        options: data.options,
        multiSelect: data.multiSelect,
        allowCustom: data.allowCustom,
      });
      setPhase("ask_user");
    });

    es.addEventListener("completed", async (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      setSummary(data.summary ?? "");
      planningEsRef.current?.close();
      planningEsRef.current = null;

      // Fetch latest iteration to get desiredState
      try {
        const res = await fetch(`/api/guilds/${guildId}/conversations/${convId}`, {
          credentials: "include",
        });
        if (res.ok) {
          const convData = (await res.json()) as {
            iterations: Array<{ desiredState: unknown }>;
          };
          const latest = convData.iterations[convData.iterations.length - 1];
          if (latest) setDesiredState(latest.desiredState);
        }
      } catch {
        // ignore fetch errors here
      }

      // Mark phase as complete if this was a scoped-plan from the sidebar
      if (pendingPhaseRef.current) {
        const phase = pendingPhaseRef.current;
        pendingPhaseRef.current = null;
        setPhaseProgress((prev) => {
          const updated = { ...prev, [phase]: true };
          updatePhaseProgress(updated);
          return updated;
        });
        setSelectedPhase(null);
      }

      setPhase("completed");
    });

    es.addEventListener("error", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      showError(data.error ?? "Planning error");
      planningEsRef.current?.close();
      planningEsRef.current = null;
      setPhase("input");
    });

    es.addEventListener("expired", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as PlanningEvent;
      showError(data.error ?? "Ask user response timed out");
      planningEsRef.current?.close();
      planningEsRef.current = null;
      setPhase("input");
    });

    es.onerror = () => {
      // Connection dropped — browser auto-reconnects, or we retry
      // For minimal flow, just let it reconnect naturally
    };
  }

  // ── Phase 3: Submit ask_user answer ──────────────────────────────────────
  async function submitAskUser() {
    if (!conversationId || !askUserAnswer.trim()) return;
    clearError();

    try {
      const res = await fetch(`/api/guilds/${guildId}/conversations/${conversationId}/ask-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ answer: askUserAnswer }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showError(data.error || "Failed to submit answer");
        return;
      }

      setAskUserData(null);
      setAskUserAnswer("");
      setPhase("planning");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Cancel planning ────────────────────────────────────────────────────────
  async function cancelPlanning() {
    if (!conversationId) return;
    clearError();

    try {
      await fetch(`/api/guilds/${guildId}/conversations/${conversationId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    }

    planningEsRef.current?.close();
    planningEsRef.current = null;
    setPhase("input");
  }

  // ── Phase 4: Approve → create plan ───────────────────────────────────────
  async function approve() {
    if (!conversationId) return;
    clearError();

    try {
      const res = await fetch(`/api/guilds/${guildId}/conversations/${conversationId}/approve`, {
        method: "POST",
        credentials: "include",
      });

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
  }

  // ── Phase 5: Execute plan ────────────────────────────────────────────────
  async function executePlan(pid: string) {
    setExecEvents([]);
    connectExecSSE(pid);

    try {
      const res = await fetch(`/api/guilds/${guildId}/plans/${pid}/execute`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showError(data.error || `Execution failed (${res.status})`);
        execEsRef.current?.close();
        execEsRef.current = null;
        setPhase("completed");
        return;
      }

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!data.success) {
        showError(data.error || "Execution failed");
      }

      // SSE will update the UI in real-time; when done we show final state
      setPhase("executed");
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
      execEsRef.current?.close();
      execEsRef.current = null;
      setPhase("completed");
    }
  }

  // ── Execution SSE ──────────────────────────────────────────────────────────
  function connectExecSSE(pid: string) {
    execEsRef.current?.close();

    const es = new EventSource(`/api/plan/${pid}/stream`);
    execEsRef.current = es;

    es.addEventListener("step_started", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ExecEvent;
      setExecEvents((prev) => [...prev, { type: "step_started", stepIndex: data.stepIndex }]);
    });

    es.addEventListener("step_completed", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ExecEvent;
      setExecEvents((prev) => [
        ...prev,
        { type: "step_completed", stepIndex: data.stepIndex, result: data.result },
      ]);
    });

    es.addEventListener("step_failed", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ExecEvent;
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
      const data = JSON.parse((e as MessageEvent).data) as ExecEvent;
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

    es.addEventListener("plan_failed", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as ExecEvent;
      showError(data.error || "Execution failed");
      execEsRef.current?.close();
      execEsRef.current = null;
      setPhase("completed");
    });
  }

  // ── Phase 6: Rollback ──────────────────────────────────────────────────────
  async function rollback() {
    if (!planId) return;
    clearError();

    try {
      const res = await fetch(`/api/guilds/${guildId}/plans/${planId}/rollback`, {
        method: "POST",
        credentials: "include",
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
  }

  // ── Revise (continue from completed with new prompt) ──────────────────────
  async function revise() {
    if (!conversationId || !prompt.trim()) {
      showError("Enter a new prompt to revise.");
      return;
    }
    clearError();
    setPlanningEvents([]);
    setSummary("");
    setDesiredState(null);

    try {
      const res = await fetch(`/api/guilds/${guildId}/conversations/${conversationId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

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
  }

  // ── Template context ───────────────────────────────────────────────────────
  const [activeTemplates, setActiveTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  async function removeTemplateFromContext(templateId: string) {
    if (!conversationId) return;
    try {
      await fetch(
        `/api/guilds/${guildId}/conversations/${conversationId}/templates/${templateId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      setActiveTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch {
      // ignore
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-discord-bg flex">
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Studio {guildId ? `— ${guildId}` : ""}</h1>
          {conversationId && (
            <button
              onClick={() => setShowTemplatePanel(!showTemplatePanel)}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded text-sm transition"
            >
              Templates ({activeTemplates.length})
            </button>
          )}
        </div>

        {/* Template context panel */}
        {showTemplatePanel && conversationId && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700 max-w-2xl">
            <div className="text-sm text-gray-300 mb-3">Active Templates</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {activeTemplates.map((tmpl) => (
                <span
                  key={tmpl.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-purple-900/50 text-purple-200 rounded-full text-xs"
                >
                  {tmpl.name}
                  <button
                    onClick={() => removeTemplateFromContext(tmpl.id)}
                    className="text-purple-300 hover:text-white ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              {activeTemplates.length === 0 && (
                <span className="text-gray-500 text-xs">No templates in context</span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Templates are added as ideas for the LLM. They are not merged automatically.
            </div>
          </div>
        )}

        {/* Phase 1: Input */}
        {phase === "input" && (
          <div className="space-y-4 max-w-2xl">
            <label className="block text-discord-text-muted text-sm">
              What would you like to configure?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Create a staff channel and a moderator role..."
              className="w-full p-4 rounded bg-gray-800 text-white border border-gray-700 focus:border-blue-500 focus:outline-none"
              rows={3}
            />
            <button
              onClick={createConversation}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition"
            >
              Create & Plan
            </button>
          </div>
        )}

        {/* Phase 2: Planning in progress */}
        {phase === "planning" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Planning in progress...
            </div>
            <div className="bg-gray-900 rounded p-4 max-h-64 overflow-auto font-mono text-xs space-y-1">
              {planningEvents.map((ev, i) => (
                <div key={i} className="text-gray-300">
                  {ev.type === "turn_started" && (
                    <span className="text-blue-400">→ Turn started</span>
                  )}
                  {ev.type === "tool_called" && (
                    <span className="text-yellow-400">
                      → Tool: {(ev as PlanningEvent).toolName}
                    </span>
                  )}
                  {ev.type === "tool_result" && (
                    <span className="text-green-400">
                      ← Result: {JSON.stringify((ev as PlanningEvent).result)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={cancelPlanning}
              className="px-4 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm transition"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Phase 3: Ask user */}
        {phase === "ask_user" && askUserData && (
          <div className="space-y-4 max-w-2xl p-6 bg-gray-800 rounded-lg border border-gray-700">
            <div className="text-lg text-white font-medium">{askUserData.question}</div>
            {askUserData.options && askUserData.options.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {askUserData.options.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setAskUserAnswer(opt.label)}
                    className={`px-4 py-2 rounded transition ${
                      askUserAnswer === opt.label
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {(!askUserData.options || askUserData.options.length === 0) && (
              <input
                value={askUserAnswer}
                onChange={(e) => setAskUserAnswer(e.target.value)}
                className="w-full p-3 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                placeholder="Your answer..."
              />
            )}
            <button
              onClick={submitAskUser}
              disabled={!askUserAnswer.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded transition"
            >
              Submit Answer
            </button>
          </div>
        )}

        {/* Phase 4: Completed → Approve / Revise */}
        {phase === "completed" && (
          <div className="space-y-4 max-w-2xl">
            <div className="text-green-400 text-lg font-medium">Planning complete!</div>
            {summary && <div className="text-white">{summary}</div>}
            {desiredState !== null && (
              <div className="bg-gray-900 rounded p-4 overflow-auto max-h-96">
                <pre className="text-xs text-gray-300">{JSON.stringify(desiredState, null, 2)}</pre>
              </div>
            )}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={approve}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition"
              >
                Approve & Execute
              </button>
              <button
                onClick={revise}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded transition"
              >
                Revise
              </button>
              <button
                onClick={() => setPhase("input")}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition"
              >
                New Prompt
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a revision prompt (optional)..."
              className="w-full p-3 rounded bg-gray-800 text-white border border-gray-700 focus:border-purple-500 focus:outline-none text-sm"
              rows={2}
            />
          </div>
        )}

        {/* Phase 5: Executing */}
        {phase === "executing" && (
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-2 text-yellow-400">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Executing plan...
            </div>
            <div className="bg-gray-900 rounded p-4 max-h-64 overflow-auto font-mono text-xs space-y-1">
              {execEvents.map((ev, i) => (
                <div key={i} className="text-gray-300">
                  {ev.type === "step_started" && (
                    <span className="text-yellow-400">
                      → Step {(ev as ExecEvent).stepIndex} started
                    </span>
                  )}
                  {ev.type === "step_completed" && (
                    <span className="text-green-400">
                      ← Step {(ev as ExecEvent).stepIndex} completed
                    </span>
                  )}
                  {ev.type === "step_failed" && (
                    <span className="text-red-400">
                      ✗ Step {(ev as ExecEvent).stepIndex} failed: {(ev as ExecEvent).error}
                    </span>
                  )}
                  {ev.type === "step_retry" && (
                    <span className="text-orange-400">
                      ⟳ Step {(ev as ExecEvent).stepIndex} retrying: {(ev as ExecEvent).error}
                    </span>
                  )}
                  {ev.type === "rollback_started" && (
                    <span className="text-purple-400">↺ Rollback started...</span>
                  )}
                  {ev.type === "rollback_completed" && (
                    <span className="text-green-400">↺ Rollback completed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 6: Executed → Rollback */}
        {phase === "executed" && (
          <div className="space-y-4 max-w-2xl">
            <div className="text-green-400 text-lg font-medium">Execution complete!</div>
            <div className="flex gap-3">
              <button
                onClick={rollback}
                className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded transition"
              >
                Rollback
              </button>
              <button
                onClick={() => setPhase("input")}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition"
              >
                New Plan
              </button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/50 border border-red-700 rounded text-red-200 max-w-2xl">
            {error}
          </div>
        )}
      </div>
      {guildId && (
        <ProcedureSidebar
          phaseProgress={phaseProgress}
          onSendPrompt={handleSidebarSendPrompt}
          selectedPhase={selectedPhase}
          onSelectPhase={setSelectedPhase}
        />
      )}
    </div>
  );
}
