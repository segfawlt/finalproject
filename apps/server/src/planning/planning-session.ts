import { DesiredStateStore, getTool, getOpenAIFunctionDefinitions } from "@repo/shared";
import { logger } from "../utils/logger";
import type { ServerState, DesiredState, PlanResult } from "@repo/shared";
import { formatGuildForLLM } from "../bot/formatter";
import { parseOpenRouterStream } from "./stream-parser";

export type PlanningStatus = "idle" | "planning" | "waiting_for_user" | "completed" | "error";

export interface PlanningEvent {
  type:
    | "turn_started"
    | "tool_called"
    | "tool_result"
    | "ask_user"
    | "turn_completed"
    | "completed"
    | "error"
    | "expired";
  toolName?: string;
  params?: unknown;
  result?: PlanResult | { error: string };
  question?: string;
  options?: { label: string }[];
  multiSelect?: boolean;
  allowCustom?: boolean;
  summary?: string;
  reasoning?: string;
  error?: string;
}

export type PlanningEventEmitter = (event: PlanningEvent) => void | Promise<void>;

/**
 * OpenRouter-compatible message format.
 */
interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface PlanningSessionOptions {
  guildId: string;
  conversationId: string;
  userPrompt: string;
  serverState: ServerState;
  forkStateHash: string;
  emit: PlanningEventEmitter;
  onTurnComplete?: (session: PlanningSession) => Promise<void>;
}

/**
 * PlanningSession orchestrates the LLM planning loop.
 *
 * Usage:
 *   const session = new PlanningSession({ guildId, conversationId, userPrompt, serverState, forkStateHash, emit });
 *   await session.start();
 *   // emits events as planning progresses
 *   // on ask_user, session.status === "waiting_for_user"
 *   // call session.resume(answer) to continue
 *   // when done, session.getDesiredState() returns the final state
 */
export class PlanningSession {
  guildId: string;
  conversationId: string;
  userPrompt: string;
  forkStateHash: string;
  store: DesiredStateStore;
  messages: LLMMessage[];
  status: PlanningStatus = "idle";
  emit: PlanningEventEmitter;
  onTurnComplete?: (session: PlanningSession) => Promise<void>;
  lastSummary = "";
  lastReasoning = "";
  private abortController: AbortController = new AbortController();
  private preTurnSnapshot: DesiredState | null = null;

  // Active templates injected into system prompt
  activeTemplates: Array<{ id: string; name: string; summary: string }> = [];

  // Track ask_user pause state
  private pendingAskUser: {
    toolCallId: string;
    question: string;
    options?: { label: string }[];
    multiSelect?: boolean;
    allowCustom?: boolean;
  } | null = null;

  constructor(options: PlanningSessionOptions) {
    this.guildId = options.guildId;
    this.conversationId = options.conversationId;
    this.userPrompt = options.userPrompt;
    this.forkStateHash = options.forkStateHash;
    this.store = DesiredStateStore.fork(options.serverState);
    this.emit = options.emit;
    this.onTurnComplete = options.onTurnComplete;

    // Build initial messages
    const systemPrompt = this.buildSystemPrompt(options.serverState);
    this.messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: options.userPrompt },
    ];
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.status = "planning";
    this.abortController = new AbortController();
    try {
      await this.runLoop();
    } catch (err) {
      this.status = "error";
      const error = err instanceof Error ? err.message : String(err);
      await this.emit({ type: "error", error });
      throw err;
    }
  }

  /** Resume after an ask_user pause. */
  async resume(answer: string): Promise<void> {
    if (this.status !== "waiting_for_user" || !this.pendingAskUser) {
      throw new Error("Cannot resume: not paused on ask_user");
    }

    // Add the user's answer as a tool result
    this.messages.push({
      role: "tool",
      content: answer,
      tool_call_id: this.pendingAskUser.toolCallId,
    });

    this.pendingAskUser = null;
    this.status = "planning";

    try {
      await this.runLoop();
    } catch (err) {
      this.status = "error";
      const error = err instanceof Error ? err.message : String(err);
      await this.emit({ type: "error", error });
      throw err;
    }
  }

  /** Continue the conversation with a new prompt (Revise). */
  async revise(newPrompt: string): Promise<void> {
    if (this.status !== "completed") {
      throw new Error("Cannot revise: session not completed");
    }

    this.messages.push({ role: "user", content: newPrompt });
    this.status = "planning";
    this.abortController = new AbortController();

    try {
      await this.runLoop();
    } catch (err) {
      this.status = "error";
      const error = err instanceof Error ? err.message : String(err);
      await this.emit({ type: "error", error });
      throw err;
    }
  }

  getDesiredState(): DesiredState {
    return this.store.getState();
  }

  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /** Add a template to the conversation context. Rebuilds system prompt. */
  addTemplate(template: { id: string; name: string; summary: string }): void {
    if (this.activeTemplates.some((t) => t.id === template.id)) return;
    this.activeTemplates.push(template);
    this.rebuildSystemPrompt();
  }

  /** Remove a template from the conversation context. Rebuilds system prompt. */
  removeTemplate(templateId: string): void {
    this.activeTemplates = this.activeTemplates.filter((t) => t.id !== templateId);
    this.rebuildSystemPrompt();
  }

  private rebuildSystemPrompt(): void {
    if (this.messages.length === 0) return;
    // Replace the first message (system prompt) with updated version
    const serverState = this.store.getState();
    this.messages[0] = {
      role: "system",
      content: this.buildSystemPrompt({
        guildId: serverState.guildId,
        guildName: serverState.guildName,
        memberCount: 0,
        channels: [],
        roles: [],
        overwrites: [],
      }),
    };
  }

  /** Cancel the current planning loop. Reverts to last snapshot if called mid-turn. */
  cancel(reason = "User cancelled"): void {
    this.status = "idle";
    this.abortController.abort(reason);
    // Revert to pre-turn snapshot if available
    if (this.preTurnSnapshot) {
      this.store.revert(this.preTurnSnapshot);
    }
  }

  // ── Core Loop ──────────────────────────────────────────────────────────────

  private async runLoop(): Promise<void> {
    let maxTurns = 20;

    while (this.status === "planning" && maxTurns-- > 0) {
      // Save snapshot before this turn for possible cancellation
      this.preTurnSnapshot = this.store.snapshot();

      await this.emit({ type: "turn_started" });

      const response = await this.callLLM();

      const turnResult = await this.processTurn(response);

      // Persist iteration snapshot after this turn
      try {
        await this.onTurnComplete?.(this);
      } catch (err) {
        logger.error(err, "[planning-session] onTurnComplete failed");
      }

      if (turnResult === "completed") {
        return;
      }
      if (turnResult === "ask_user") {
        return;
      }
    }

    if (maxTurns <= 0) {
      this.status = "completed";
      this.lastSummary = "Planning reached maximum number of turns.";
      await this.emit({
        type: "completed",
        summary: this.lastSummary,
      });
    }
  }

  private async processTurn(response: LLMMessage): Promise<"completed" | "ask_user" | "continue"> {
    // If ask_user was triggered during streaming, status is already set
    if (this.status === "waiting_for_user") {
      return "ask_user";
    }

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // LLM stopped calling tools — planning complete
      this.status = "completed";
      this.lastSummary = response.content;
      this.lastReasoning = response.content;
      await this.emit({
        type: "completed",
        summary: response.content,
        reasoning: response.content,
      });
      return "completed";
    }

    // Tool calls were already dispatched during streaming.
    // Just return continue so the loop proceeds.
    return "continue";
  }

  // ── Tool Dispatch ──────────────────────────────────────────────────────────

  private async dispatchTool(toolCall: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }): Promise<
    | { type: "success"; result: PlanResult }
    | { type: "error"; result: { error: string } }
    | {
        type: "ask_user";
        question: string;
        options?: { label: string }[];
        multiSelect?: boolean;
        allowCustom?: boolean;
      }
  > {
    const toolName = toolCall.function.name;
    const params = JSON.parse(toolCall.function.arguments);

    await this.emit({ type: "tool_called", toolName, params });

    try {
      const tool = getTool(toolName);
      const result = tool.plan(params, this.store);

      await this.emit({ type: "tool_result", toolName, result });

      if (tool.executionMode === "planning_only") {
        return {
          type: "ask_user",
          question: params.question,
          options: params.options,
          multiSelect: params.multiSelect,
          allowCustom: params.allowCustom,
        };
      }

      return { type: "success", result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.emit({ type: "tool_result", toolName, result: { error } });
      return { type: "error", result: { error } };
    }
  }

  // ── LLM Integration ────────────────────────────────────────────────────────

  private async callLLM(): Promise<LLMMessage> {
    const functions = getOpenAIFunctionDefinitions();

    const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      // No API key configured — return mock for development
      return this.mockLLMResponse();
    }

    const fetchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.WEB_APP_URL ?? "http://localhost:5173",
        "X-Title": "Discord Platform",
      },
      body: JSON.stringify({
        model,
        messages: this.messages,
        tools: functions,
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 4096,
        stream: true, // Enable streaming
      }),
      signal: this.abortController.signal,
    });

    if (!fetchResponse.ok) {
      const text = await fetchResponse.text();
      throw new Error(`OpenRouter error ${fetchResponse.status}: ${text}`);
    }

    if (!fetchResponse.body) {
      throw new Error("OpenRouter returned empty body");
    }

    // Parse streaming response, dispatching tool calls incrementally
    const result = await parseOpenRouterStream(fetchResponse.body, {
      onToolCall: async (tc) => {
        // Stop dispatching further tool calls if ask_user was triggered
        if (this.status === "waiting_for_user") return;
        await this.handleStreamedToolCall(tc);
      },
    });

    // Emit turn completion with thinking text
    await this.emit({
      type: "turn_completed",
      summary: result.thinking.slice(0, 200),
      reasoning: result.thinking,
    });

    // Build final LLM message from accumulated result
    return {
      role: "assistant",
      content: result.thinking,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type as "function",
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    };
  }

  private async handleStreamedToolCall(tc: {
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }): Promise<void> {
    const toolCall = {
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    };

    const result = await this.dispatchTool(toolCall);

    // Push assistant message (contains tool call)
    this.messages.push({
      role: "assistant",
      content: "",
      tool_calls: [toolCall],
    });

    if (result.type === "ask_user") {
      this.status = "waiting_for_user";
      this.pendingAskUser = {
        toolCallId: toolCall.id,
        question: result.question,
        options: result.options,
        multiSelect: result.multiSelect,
        allowCustom: result.allowCustom,
      };
      await this.emit({
        type: "ask_user",
        question: result.question,
        options: result.options,
        multiSelect: result.multiSelect,
        allowCustom: result.allowCustom,
      });
      return;
    }

    // Add tool result
    this.messages.push({
      role: "tool",
      content: JSON.stringify(result.result),
      tool_call_id: toolCall.id,
    });
  }

  private mockLLMResponse(): LLMMessage {
    // Development fallback when no API key is configured
    return {
      role: "assistant",
      content: "I have updated the server configuration based on your request.",
    };
  }

  // ── System Prompt ──────────────────────────────────────────────────────────

  private buildSystemPrompt(serverState: ServerState): string {
    const lines: string[] = [];

    lines.push("You are a Discord server configuration assistant.");
    lines.push("");
    lines.push(
      "Your job: help administrators configure their Discord server by calling the provided tools."
    );
    lines.push("");
    lines.push("Current server state:");
    lines.push(
      formatGuildForLLM(serverState.guildId, serverState.guildName, serverState.memberCount)
    );
    lines.push("");
    lines.push("Planning phases (complete each before moving to the next):");
    lines.push(
      "  Phase 1 — Foundation: Roles only (create/edit/delete/move_role)."
    );
    lines.push(
      "           Do NOT create categories, channels, or set overwrites in this phase."
    );
    lines.push(
      "  Phase 2 — Server Layout: Categories + channel structure."
    );
    lines.push(
      "           Tools: create/edit/delete/move_category, create/edit/delete/move_channel."
    );
    lines.push(
      "           Default lock_permissions: true on channels under categories."
    );
    lines.push(
      "           Do NOT modify roles or set permission overwrites in this phase."
    );
    lines.push(
      "  Phase 3 — Access Control: Channel/category overwrites."
    );
    lines.push(
      "           Tools: set_overwrite, remove_overwrite, batch_set_overwrite."
    );
    lines.push("");
    lines.push("  PERMISSION STRATEGY:");
    lines.push(
      "  - Convention: channels with no lock marker are synced to their category."
    );
    lines.push(
      "    Only [unsynced] channels have independent overwrites."
    );
    lines.push(
      "  - Default: lock_permissions: true on channels under a category."
    );
    lines.push(
      "    Set overwrites on the CATEGORY, not individual channels."
    );
    lines.push(
      "  - Scan channels within each category for identical overwrite patterns."
    );
    lines.push(
      "    When found, propose consolidation: move overwrites to the category"
    );
    lines.push("    level and sync the channels.");
    lines.push(
      "  - If ONE channel needs different permissions than its category:"
    );
    lines.push(
      "    lock_permissions: false on that channel, add specific overwrites."
    );
    lines.push(
      "  - If MOST channels in a category need different permissions:"
    );
    lines.push(
      "    skip category-level overwrites entirely. Set per-channel."
    );
    lines.push(
      "  - When uncertain whether a channel should be synced or independent,"
    );
    lines.push("    use ask_user to clarify. Do not guess.");
    lines.push(
      "  - Do NOT set the same overwrites on every channel in a category."
    );
    lines.push("    Put them on the category once.");
    lines.push(
      "  - Do NOT create new channels or modify roles in this phase."
    );
    lines.push(
      "  Phase 4 — People: Member role assignments."
    );
    lines.push(
      "           Tools: add_role_to_member, remove_role_from_member."
    );
    lines.push(
      "           Do NOT create roles or modify permissions in this phase."
    );
    lines.push("");
    lines.push("Important rules:");
    lines.push(
      "- Use edit_* tools to rename or modify existing resources. Do NOT delete and recreate."
    );
    lines.push("- Use create_* tools only for genuinely new resources.");
    lines.push("- Use move_* tools to change position or parent.");
    lines.push("- Use ask_user when the request is ambiguous or missing critical details.");
    lines.push("- Always use edit_role to change role permissions, not delete+create.");
    lines.push(
      "- When creating channels inside a category, set parent_id to the category's symbol or ID."
    );
    lines.push(
      "- Permission names must be exact: VIEW_CHANNEL, SEND_MESSAGES, MANAGE_CHANNELS, etc."
    );
    lines.push("- Channel names should be lowercase with hyphens (e.g., 'general-chat').");
    lines.push("- Only plan what the user asked for. Do not expand scope.");
    lines.push(
      "- If the user asks for Phase N+1 work without Phases 1..N complete, you MAY proceed but MUST note the risk in your summary."
    );
    lines.push("");
    if (this.activeTemplates.length > 0) {
      lines.push("Available template layouts for inspiration:");
      for (const tmpl of this.activeTemplates) {
        lines.push(`- ${tmpl.name}: ${tmpl.summary}`);
      }
      lines.push("");
    }

    lines.push("Available tools:");
    for (const tool of getOpenAIFunctionDefinitions()) {
      lines.push(`- ${tool.function.name}: ${tool.function.description}`);
    }
    lines.push("");
    lines.push(
      "Think step by step. Call tools one at a time. When you're done, stop calling tools and summarize the changes."
    );

    return lines.join("\n");
  }
}
