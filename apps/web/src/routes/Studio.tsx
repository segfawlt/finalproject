import { useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Loader, Check, CircleAlert, LayoutGrid } from "lucide-react";
import DesiredStateView from "../components/DesiredStateView";
import type { DesiredState, ServerState, ChannelBase, Role } from "../components/desired-state";
import ActionBar, { type StudioPhase } from "../components/ActionBar";
import ExecutionStatus, { type ExecEvent } from "../components/ExecutionStatus";
import IterationHistory, { type IterationRow } from "../components/IterationHistory";
import TemplatePanel from "../components/TemplatePanel";
import StudioShell from "../components/studio/StudioShell";
import StudioHeader from "../components/studio/StudioHeader";
import ConversationSidebar from "../components/studio/ConversationSidebar";
import { apiFetch } from "../lib/api";

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

function parseSseData<T>(e: Event): T | null {
  const me = e as MessageEvent;
  if (!me.data) return null;
  try {
    return JSON.parse(me.data) as T;
  } catch {
    return null;
  }
}

export default function Studio() {
  const { guildId } = useParams<{ guildId: string }>();

  // ── Phase & IDs ──────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<StudioPhase>("input");
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
  const [askUserSelected, setAskUserSelected] = useState<string[]>([]);
  const [askUserCustom, setAskUserCustom] = useState("");

  // ── Completed ────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState("");
  const [desiredState, setDesiredState] = useState<DesiredState | null>(null);
  const [iterations, setIterations] = useState<IterationRow[]>([]);
  const [currentState, setCurrentState] = useState<ServerState | null>(null);

  // ── Execution ────────────────────────────────────────────────────────────
  const [execEvents, setExecEvents] = useState<ExecEvent[]>([]);

  // ── Error ────────────────────────────────────────────────────────────────
  const [error, setError] = useState("");

  // ── SSE refs ─────────────────────────────────────────────────────────────
  const planningEsRef = useRef<EventSource | null>(null);
  const execEsRef = useRef<EventSource | null>(null);
  const esRefFailures = useRef(0);
  const inFlightRef = useRef(false);
  // Mirror of askUserData so SSE listeners — which capture stale closures
  // — can see the latest value when an error fires mid-ask_user.
  const askUserDataRef = useRef<typeof askUserData>(null);
  useEffect(() => {
    askUserDataRef.current = askUserData;
  }, [askUserData]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      planningEsRef.current?.close();
      execEsRef.current?.close();
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function clearError() {
    setError("");
  }

  function showError(msg: string) {
    setError(msg);
  }

  // Guard against double-click on action buttons (Create, Approve, Execute,
  // Rollback, Revise, AskUser). Sets inFlightRef at entry and clears in
  // a finally; returns true when a request is already in flight so the
  // caller can bail. Also mirrored to `inFlight` state for the ActionBar
  // to disable its buttons.
  const [inFlight, setInFlight] = useState(false);
  function enterInFlight(): boolean {
    if (inFlightRef.current) return true;
    inFlightRef.current = true;
    setInFlight(true);
    return false;
  }
  function exitInFlight() {
    inFlightRef.current = false;
    setInFlight(false);
  }

  // ── Sidebar scoped prompt (removed with ProcedureSidebar) ───────────────
  // The 4-phase model was internal scaffolding; chat UX replaces it.

  // ── Phase 1: Create conversation & start planning ────────────────────────
  async function createConversation() {
    if (!prompt.trim()) {
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

      try {
        const res = await apiFetch(`/api/guilds/${guildId}/conversations`, {
          method: "POST",
          body: { userPrompt: prompt },
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
    } finally {
      exitInFlight();
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
      const data = parseSseData<PlanningEvent>(e);
      if (!data) return;
      setPlanningEvents((prev) => [
        ...prev,
        { type: "tool_called", toolName: data.toolName, params: data.params },
      ]);
    });

    es.addEventListener("tool_result", (e) => {
      const data = parseSseData<PlanningEvent>(e);
      if (!data) return;
      setPlanningEvents((prev) => [
        ...prev,
        { type: "tool_result", toolName: data.toolName, result: data.result },
      ]);
    });

    es.addEventListener("ask_user", (e) => {
      const data = parseSseData<PlanningEvent>(e);
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
      const data = parseSseData<PlanningEvent>(e);
      if (!data) return;
      setSummary(data.summary ?? "");
      planningEsRef.current?.close();
      planningEsRef.current = null;

      // Fetch conversation to get full iteration history and latest desiredState
      try {
        const res = await apiFetch(`/api/guilds/${guildId}/conversations/${convId}`);
        if (res.ok) {
          const convData = (await res.json()) as { iterations: IterationRow[] };
          const iters = convData.iterations ?? [];
          setIterations(iters);
          const latest = iters.length > 0 ? iters[iters.length - 1] : null;
          if (latest) setDesiredState(latest.desiredState);
        }
      } catch {
        // ignore fetch errors here
      }

      // Fetch current Discord state for the diff overlay (best-effort).
      setCurrentState(null);
      try {
        const stateRes = await apiFetch(`/api/guilds/${guildId}/state`);
        if (stateRes.ok) {
          setCurrentState((await stateRes.json()) as ServerState);
        }
      } catch {
        // diff overlay just stays hidden
      }

      setPhase("completed");
    });

    es.addEventListener("error", (e) => {
      const data = parseSseData<PlanningEvent>(e);
      showError(data?.error ?? "Planning error");
      planningEsRef.current?.close();
      planningEsRef.current = null;
      // If the user was mid-answer to an ask_user, keep that state so they
      // can retry instead of silently losing the question and selection.
      // Read the latest value from the ref because the listener closure
      // captured askUserData as null at attach time.
      if (!askUserDataRef.current) {
        setPhase("input");
      } else {
        setPhase("ask_user");
      }
    });

    es.addEventListener("expired", (e) => {
      const data = parseSseData<PlanningEvent>(e);
      showError(data?.error ?? "Ask user response timed out");
      planningEsRef.current?.close();
      planningEsRef.current = null;
      setAskUserData(null);
      setAskUserSelected([]);
      setAskUserCustom("");
      setPhase("input");
    });

    es.onerror = () => {
      // Connection dropped — browser auto-reconnects, or we retry
      // For minimal flow, just let it reconnect naturally
    };
  }

  // ── Phase 3: Submit ask_user answer ──────────────────────────────────────
  async function submitAskUser() {
    if (!conversationId) return;
    if (enterInFlight()) return;
    try {
      const parts: string[] = [];
      if (askUserData?.multiSelect) {
        parts.push(...askUserSelected);
      } else if (askUserSelected.length > 0) {
        parts.push(askUserSelected[0]);
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
          {
            method: "POST",
            body: { answer },
          }
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
  }

  // ── Reset everything for a fresh plan/prompt ────────────────────────────
  function resetPlanningState() {
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
    setShowTemplatePanel(false);
    setActiveTemplates([]);
    setPhase("input");
  }

  // ── Load a past conversation from history ───────────────────────────────
  // Closes any active SSE, fetches the conversation + its iteration
  // history, and lands the studio on the "completed" view so the user
  // can see the prior desired state with its diff overlay.
  async function loadConversation(convId: string) {
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
      setSummary("");
      setError("");
      setPhase("completed");
      setActiveTemplates([]);

      try {
        const res = await apiFetch(`/api/guilds/${guildId}/conversations/${convId}`);
        if (res.ok) {
          const convData = (await res.json()) as { iterations: IterationRow[] };
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
        // diff overlay just stays hidden
      }
    } finally {
      exitInFlight();
    }
  }

  // ── Cancel planning ────────────────────────────────────────────────────────
  async function cancelPlanning() {
    if (!conversationId) return;
    clearError();

    try {
      await apiFetch(`/api/guilds/${guildId}/conversations/${conversationId}/cancel`, {
        method: "POST",
      });
    } catch {
      // ignore
    }

    resetPlanningState();
  }

  // ── Phase 4: Approve → create plan ───────────────────────────────────────
  async function approve() {
    if (!conversationId) return;
    if (enterInFlight()) return;
    try {
      clearError();

      try {
        const res = await apiFetch(
          `/api/guilds/${guildId}/conversations/${conversationId}/approve`,
          {
            method: "POST",
          }
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
  }

  // ── Phase 5: Execute plan ────────────────────────────────────────────────
  // Called internally from approve(), which already holds the in-flight lock.
  async function executePlan(pid: string) {
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
        };
        const details = [
          ...(data.conflicts ?? []),
          ...(data.blockers?.map((b) => b.message) ?? []),
        ].join("\n");
        showError(details ? `${data.error}\n${details}` : data.error);
        execEsRef.current?.close();
        execEsRef.current = null;
        setPhase("execute_failed");
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
  }

  // ── Execution SSE ──────────────────────────────────────────────────────────
  function connectExecSSE(pid: string) {
    execEsRef.current?.close();
    esRefFailures.current = 0;

    const es = new EventSource(`/api/plan/${pid}/stream`);
    execEsRef.current = es;

    es.addEventListener("step_started", (e) => {
      const data = parseSseData<ExecEvent>(e);
      if (!data) return;
      setExecEvents((prev) => [...prev, { type: "step_started", stepIndex: data.stepIndex }]);
    });

    es.addEventListener("step_completed", (e) => {
      const data = parseSseData<ExecEvent>(e);
      if (!data) return;
      setExecEvents((prev) => [
        ...prev,
        { type: "step_completed", stepIndex: data.stepIndex, result: data.result },
      ]);
    });

    es.addEventListener("step_failed", (e) => {
      const data = parseSseData<ExecEvent>(e);
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
      const data = parseSseData<ExecEvent>(e);
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

    es.addEventListener("plan_failed", (e) => {
      const data = parseSseData<ExecEvent>(e);
      showError(data?.error || "Execution failed");
      execEsRef.current?.close();
      execEsRef.current = null;
      setPhase("completed");
    });

    es.onerror = () => {
      // Surface the connection error and stop reconnect attempts after a few failures
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
  }

  // ── Phase 6: Rollback ──────────────────────────────────────────────────────
  async function rollback() {
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
  }

  // ── Revise (continue from completed with new prompt) ──────────────────────
  async function revise() {
    if (!conversationId || !prompt.trim()) {
      showError("Enter a new prompt to revise.");
      return;
    }
    if (enterInFlight()) return;
    try {
      clearError();
      setPlanningEvents([]);
      setSummary("");
      setDesiredState(null);
      setIterations([]);
      setCurrentState(null);

      try {
        const res = await apiFetch(
          `/api/guilds/${guildId}/conversations/${conversationId}/revise`,
          {
            method: "POST",
            body: { prompt: prompt.trim() },
          }
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
  }

  // ── Revert to a past iteration (completed phase only) ────────────────────
  async function revert(version: number) {
    if (!conversationId || !guildId) return;
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

        // Refetch conversation to pick up the new revert iteration and snapshot
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
  }

  // ── Template context ───────────────────────────────────────────────────────
  const [activeTemplates, setActiveTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  // ── Manual edit mode ─────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editableState, setEditableState] = useState<DesiredState | null>(null);

  function enterEditMode() {
    if (!desiredState) return;
    setEditableState(structuredClone(desiredState));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditableState(null);
  }

  async function saveEdit() {
    if (!conversationId || !guildId || !editableState) return;
    if (enterInFlight()) return;
    try {
      clearError();
      try {
        const res = await apiFetch(
          `/api/guilds/${guildId}/conversations/${conversationId}/edit-state`,
          { method: "POST", body: { desiredState: editableState } }
        );
        if (!res.ok) {
          const data = (await res.json()) as { error: string };
          showError(data.error || "Failed to save edit");
          return;
        }

        // Refetch conversation to pick up the new manual_edit iteration.
        const convRes = await apiFetch(`/api/guilds/${guildId}/conversations/${conversationId}`);
        if (convRes.ok) {
          const convData = (await convRes.json()) as { iterations: IterationRow[] };
          const iters = convData.iterations ?? [];
          setIterations(iters);
          const latest = iters.length > 0 ? iters[iters.length - 1] : null;
          if (latest) setDesiredState(latest.desiredState);
        }
        setEditing(false);
        setEditableState(null);
      } catch (err) {
        showError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      exitInFlight();
    }
  }

  // Helpers that splice changes into the working-copy DesiredState. Items are
  // keyed by their id (real Discord id or `$ch_$N` symbol), so the parent map
  // is rebuilt with the touched entry replaced in place.
  function patchChannel(id: string, next: ChannelBase) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        active: { ...prev.active, channels: { ...prev.active.channels, [id]: next } },
      };
    });
  }
  function patchRole(id: string, next: Role) {
    setEditableState((prev) => {
      if (!prev) return prev;
      return { ...prev, active: { ...prev.active, roles: { ...prev.active.roles, [id]: next } } };
    });
  }
  function deleteChannel(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.channels[id];
      if (!existing) return prev;
      const { [id]: _removed, ...rest } = prev.active.channels;
      return {
        ...prev,
        active: { ...prev.active, channels: rest },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: existing.type === 4 ? ("category" as const) : ("channel" as const),
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }
  function deleteRole(id: string) {
    setEditableState((prev) => {
      if (!prev) return prev;
      const existing = prev.active.roles[id];
      if (!existing) return prev;
      const { [id]: _removed, ...rest } = prev.active.roles;
      return {
        ...prev,
        active: { ...prev.active, roles: rest },
        tombstones: [
          ...prev.tombstones,
          {
            discordId: existing.id,
            resourceType: "role" as const,
            name: existing.name,
            deletedInVersion: prev.version,
          },
        ],
      };
    });
  }
  // New items get a $prefix symbol mirroring the server-side store. Symbol
  // counter is bumped inline; the server's revert/insert path assigns the
  // final version but doesn't care which local symbol we picked.
  function addChannel() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"ch"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-channel",
              type: 0,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }
  function addCategory() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"cat"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          channels: {
            ...prev.active.channels,
            [id]: {
              id,
              name: "new-category",
              type: 4,
              parentId: null,
              position: Object.values(prev.active.channels).length,
            },
          },
        },
      };
    });
  }
  function addRole() {
    setEditableState((prev) => {
      if (!prev) return prev;
      const id = `$${"role"}_${prev.symbolCounter}`;
      return {
        ...prev,
        symbolCounter: prev.symbolCounter + 1,
        active: {
          ...prev.active,
          roles: {
            ...prev.active.roles,
            [id]: {
              id,
              name: "new-role",
              position: Object.values(prev.active.roles).length,
              permissions: [],
              color: 0,
              hoist: false,
              mentionable: false,
            },
          },
        },
      };
    });
  }

  // ── Guild picker (only when /studio is hit without a guildId) ──────────────
  const [availableGuilds, setAvailableGuilds] = useState<
    Array<{ id: string; name: string; icon: string | null; memberCount: number }>
  >([]);
  const [guildsLoading, setGuildsLoading] = useState(false);

  useEffect(() => {
    if (guildId) return;
    setGuildsLoading(true);
    apiFetch("/api/guilds")
      .then((res) => (res.ok ? res.json() : []))
      .then(
        (data: Array<{ id: string; name: string; icon: string | null; memberCount: number }>) => {
          setAvailableGuilds(data);
        }
      )
      .catch(() => setAvailableGuilds([]))
      .finally(() => setGuildsLoading(false));
  }, [guildId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <StudioShell
      header={<StudioHeader />}
      sidebar={
        guildId ? (
          <ConversationSidebar
            guildId={guildId}
            activeConversationId={conversationId}
            onSelectConversation={loadConversation}
            onNewChat={resetPlanningState}
          />
        ) : undefined
      }
    >
      <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-discord-bg-secondary border border-discord-divider flex items-center justify-center shrink-0">
                <LayoutGrid size={18} className="text-discord-text-muted" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-discord-text-muted font-semibold">
                  Studio
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-discord-text truncate">
                  {guildId ? `Guild ${guildId}` : "Server Configuration"}
                </h1>
              </div>
            </div>
            {conversationId && (
              <button
                onClick={() => setShowTemplatePanel(!showTemplatePanel)}
                className="px-4 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded text-sm transition"
              >
                Templates ({activeTemplates.length})
              </button>
            )}
          </div>

          {/* Template context panel */}
          {showTemplatePanel && conversationId && guildId && (
            <TemplatePanel
              guildId={guildId}
              conversationId={conversationId}
              active={activeTemplates}
              onActiveChange={setActiveTemplates}
            />
          )}

          {/* Phase 1: Input */}
          {phase === "input" && (
            <div className="space-y-4 max-w-2xl">
              {!guildId && (
                <div className="p-4 bg-discord-bg-secondary rounded-lg border border-discord-divider space-y-3">
                  <div className="text-sm text-discord-text font-medium">
                    Select a guild to plan against
                  </div>
                  {guildsLoading ? (
                    <div className="text-sm text-discord-text-muted">Loading guilds…</div>
                  ) : availableGuilds.length === 0 ? (
                    <div className="text-sm text-discord-text-muted">
                      No guilds available. Make sure the bot is invited to a guild you admin.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableGuilds.map((g) => (
                        <a
                          key={g.id}
                          href={`/studio/${g.id}`}
                          className="px-3 py-2 rounded bg-discord-bg-tertiary hover:bg-discord-channel-hover text-white text-sm flex items-center gap-2 transition"
                        >
                          <span className="truncate">{g.name}</span>
                          <span className="text-xs text-discord-text-muted ml-auto">
                            {g.memberCount} members
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <label className="block text-discord-text-muted text-sm">
                What would you like to configure?
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., Create a staff channel and a moderator role..."
                className="w-full p-4 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none"
                rows={3}
              />
              <button
                onClick={createConversation}
                className="px-6 py-2 bg-discord-accent hover:bg-discord-accent-hover text-white rounded transition"
              >
                Create & Plan
              </button>
            </div>
          )}

          {/* Phase 2: Planning in progress */}
          {phase === "planning" && (
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2 text-discord-green">
                <Loader size={14} className="animate-spin" />
                Planning in progress...
              </div>
              <div className="bg-discord-bg-tertiary rounded p-4 max-h-64 overflow-auto font-mono text-xs space-y-1 border border-discord-divider">
                {planningEvents.map((ev, i) => (
                  <div key={i} className="text-discord-text">
                    {ev.type === "turn_started" && (
                      <span className="text-discord-text-link">→ Turn started</span>
                    )}
                    {ev.type === "tool_called" && (
                      <span className="text-discord-yellow">
                        → Tool: {(ev as PlanningEvent).toolName}
                      </span>
                    )}
                    {ev.type === "tool_result" && (
                      <span className="text-discord-green">
                        ← Result: {JSON.stringify((ev as PlanningEvent).result)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phase 3: Ask user */}
          {phase === "ask_user" && askUserData && (
            <div className="space-y-4 max-w-2xl p-6 bg-discord-bg-secondary rounded-lg border border-discord-divider">
              <div className="text-lg text-discord-text font-medium">{askUserData.question}</div>
              {askUserData.options && askUserData.options.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {askUserData.options.map((opt) => {
                    const selected = askUserData.multiSelect
                      ? askUserSelected.includes(opt.label)
                      : askUserSelected[0] === opt.label;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => {
                          if (askUserData.multiSelect) {
                            setAskUserSelected((prev) =>
                              prev.includes(opt.label)
                                ? prev.filter((l) => l !== opt.label)
                                : [...prev, opt.label]
                            );
                          } else {
                            setAskUserSelected([opt.label]);
                          }
                        }}
                        className={`px-4 py-2 rounded transition flex items-center gap-1 ${
                          selected
                            ? "bg-discord-accent text-white"
                            : "bg-discord-bg-tertiary text-discord-text hover:bg-discord-channel-hover"
                        }`}
                      >
                        {selected && askUserData.multiSelect ? <Check size={14} /> : null}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
              {(!askUserData.options ||
                askUserData.options.length === 0 ||
                askUserData.allowCustom) && (
                <input
                  value={askUserCustom}
                  onChange={(e) => setAskUserCustom(e.target.value)}
                  className="w-full p-3 rounded bg-discord-bg-tertiary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none"
                  placeholder={
                    askUserData.options && askUserData.options.length > 0
                      ? "Or type a custom answer..."
                      : "Your answer..."
                  }
                />
              )}
              <button
                onClick={submitAskUser}
                disabled={askUserSelected.length === 0 && !askUserCustom.trim()}
                className="px-6 py-2 bg-discord-accent hover:bg-discord-accent-hover disabled:bg-discord-bg-tertiary text-white rounded transition"
              >
                Submit Answer
              </button>
            </div>
          )}

          {/* Phase 4: Completed → Approve / Revise / Edit */}
          {phase === "completed" && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center gap-2 text-discord-green text-lg font-medium">
                <Check size={18} />
                Planning complete!
              </div>
              {summary && !editing && <div className="text-discord-text">{summary}</div>}
              <DesiredStateView
                desiredState={editing ? editableState : desiredState}
                currentState={editing ? null : currentState}
                editing={editing}
                onChannelChange={patchChannel}
                onChannelDelete={deleteChannel}
                onChannelAdd={addChannel}
                onCategoryChange={patchChannel}
                onCategoryDelete={deleteChannel}
                onCategoryAdd={addCategory}
                onRoleChange={patchRole}
                onRoleDelete={deleteRole}
                onRoleAdd={addRole}
              />
              {!editing && (
                <>
                  <IterationHistory
                    iterations={iterations}
                    currentVersion={
                      iterations.length > 0 ? Math.max(...iterations.map((i) => i.version)) : null
                    }
                    canRevert
                    onRevert={revert}
                  />
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a revision prompt (optional)..."
                    className="w-full p-3 rounded bg-discord-bg-secondary text-discord-text border border-discord-divider focus:border-discord-accent focus:outline-none text-sm"
                    rows={2}
                  />
                </>
              )}
            </div>
          )}

          {/* Phase 5: Executing */}
          {phase === "executing" && (
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2 text-discord-yellow">
                <Loader size={14} className="animate-spin" />
                Executing plan...
              </div>
              <ExecutionStatus events={execEvents} />
            </div>
          )}

          {/* Phase 6: Executed — footer (ActionBar) provides Rollback / New Plan */}
          {phase === "executed" && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center gap-2 text-discord-green text-lg font-medium">
                <Check size={18} />
                Execution complete!
              </div>
              <ExecutionStatus events={execEvents} />
            </div>
          )}

          {/* Phase 6b: Execution failed → distinguish from "completed" so the
            user doesn't mistake it for a successful plan */}
          {phase === "execute_failed" && (
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center gap-2 text-discord-red text-lg font-medium">
                <CircleAlert size={18} />
                Execution failed
              </div>
              {error && <div className="text-discord-text">{error}</div>}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mt-6 p-4 bg-red-900/50 border border-red-700 rounded text-red-200 max-w-2xl">
              {error}
            </div>
          )}
      </div>
      <ActionBar
        phase={phase}
        inFlight={inFlight}
        onApprove={approve}
        onRevise={revise}
        onCancel={cancelPlanning}
        onRollback={rollback}
        onNewPlan={resetPlanningState}
        editing={editing}
        onEnterEdit={enterEditMode}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
      />
    </StudioShell>
  );
}
