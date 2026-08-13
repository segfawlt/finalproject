import { DesiredStateStore, getTool, getOpenAIFunctionDefinitions } from "@repo/shared";
import { logger } from "../utils/logger";
import type { ServerState, DesiredState, PlanResult } from "@repo/shared";
import { formatGuildForLLM } from "../bot/formatter";
import { buildLLMRequest } from "./llm-request";
import { parseOpenRouterStream } from "./stream-parser";
import { SERVER_PLANNER_PROMPT, SHARED_CORE_PROMPT } from "./system-prompts";
import type { ConversationModelConfig } from "./model-config";

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
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  /** Internal provenance only. Never included in provider requests. */
  modelId?: string;
  reasoning?: string;
  reasoning_details?: unknown[];
}

/**
 * Remove model-specific reasoning from history when a different provider model
 * would receive it. The returned messages are safe to send to OpenRouter.
 */
export function prepareMessagesForModel(messages: LLMMessage[], modelId: string): LLMMessage[] {
  return messages.map(({ modelId: messageModelId, ...message }) => {
    if (message.role === "assistant" && messageModelId && messageModelId !== modelId) {
      const {
        reasoning: _reasoning,
        reasoning_details: _reasoningDetails,
        ...compatible
      } = message;
      return compatible;
    }
    return message;
  });
}

interface PlanningSessionOptions {
  guildId: string;
  conversationId: string;
  userPrompt: string;
  serverState: ServerState;
  forkStateHash: string;
  emit: PlanningEventEmitter;
  onTurnComplete?: (session: PlanningSession) => Promise<void>;
  /** Persisted conversation context for a fresh-state repair session. */
  messages?: LLMMessage[];
  /** Appended after the prior context to explain why planning restarted. */
  repairPrompt?: string;
  /** Authorised guild policy guidance included in every system-prompt rebuild. */
  guildRules?: string[];
  /** Reads the conversation row at each completion so PATCH affects only the next one. */
  getModelConfig?: () => Promise<ConversationModelConfig>;
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
  private readonly planningBaseState: ServerState;
  private readonly guildRules: string[];
  private readonly getModelConfig: () => Promise<ConversationModelConfig>;
  private abortController: AbortController = new AbortController();
  private preTurnSnapshot: DesiredState | null = null;

  // Active templates injected into system prompt
  activeTemplates: Array<{
    id: string;
    name: string;
    description: string;
    version: number;
    structure: unknown;
  }> = [];

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
    this.planningBaseState = options.serverState;
    this.guildRules = [...(options.guildRules ?? [])];
    this.store = DesiredStateStore.fork(options.serverState);
    this.emit = options.emit;
    this.onTurnComplete = options.onTurnComplete;
    this.getModelConfig =
      options.getModelConfig ??
      (async () => ({ modelId: process.env.LLM_MODEL ?? "openai/gpt-4o-mini" }));

    // Repair sessions retain prior conversation context but always replace the
    // old system message: the fresh server state is the only planning base.
    const systemPrompt = this.buildSystemPrompt(options.serverState);
    const priorMessages = options.messages?.filter((message) => message.role !== "system") ?? [];
    this.messages = [{ role: "system", content: systemPrompt }, ...priorMessages];

    if (options.repairPrompt) {
      this.messages.push({ role: "user", content: options.repairPrompt });
    } else {
      this.messages.push({ role: "user", content: options.userPrompt });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.status = "planning";
    this.abortController = new AbortController();
    logger.info(
      { conversationId: this.conversationId, guildId: this.guildId },
      "[planning-session] starting"
    );
    try {
      await this.runLoop();
    } catch (err) {
      await this.handleFailure(err);
    }
  }

  /** Resume after an ask_user pause. */
  async resume(answer: string): Promise<void> {
    if (this.status !== "waiting_for_user" || !this.pendingAskUser) {
      throw new Error("Cannot resume: not paused on ask_user");
    }

    // Fresh AbortController: the previous one was aborted when cancel()
    // was called, so reusing it would make the next fetch fail with
    // AbortError before it can reach the LLM.
    this.abortController = new AbortController();

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
      await this.handleFailure(err);
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
      await this.handleFailure(err);
    }
  }

  getDesiredState(): DesiredState {
    return this.store.getState();
  }

  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  /** Add a template to the conversation context. Rebuilds system prompt. */
  addTemplate(template: {
    id: string;
    name: string;
    description: string;
    version: number;
    structure: unknown;
  }): void {
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
    this.messages[0] = {
      role: "system",
      content: this.buildSystemPrompt(this.planningBaseState),
    };
  }

  /** Cancel the current planning loop. Reverts to last snapshot if called mid-turn. */
  cancel(reason = "User cancelled"): void {
    logger.info({ conversationId: this.conversationId, reason }, "[planning-session] cancelled");
    this.status = "idle";
    this.abortController.abort(reason);
    // Revert to pre-turn snapshot if available
    this.rollbackToTurnStart();
  }

  // ── Core Loop ──────────────────────────────────────────────────────────────

  private async runLoop(): Promise<void> {
    let maxTurns = 20;
    let turnNumber = 0;

    while (this.status === "planning" && maxTurns-- > 0) {
      turnNumber += 1;
      // Keep the original snapshot across ask_user pause/resume and all turns
      // in this completion so a later failure rolls back the whole turn.
      if (!this.preTurnSnapshot) this.preTurnSnapshot = this.store.snapshot();

      logger.info(
        { conversationId: this.conversationId, turnNumber, maxTurns },
        "[planning-session] turn started"
      );

      await this.emit({ type: "turn_started" });

      const response = await this.callLLM();

      if (this.status !== "planning") return;

      const turnResult = await this.processTurn(response);

      logger.info(
        { conversationId: this.conversationId, turnNumber, turnResult },
        "[planning-session] turn completed"
      );

      // Durable persistence is part of the turn transition. Do not publish a
      // terminal completion event until the resulting iteration is stored.
      await this.onTurnComplete?.(this);

      if (turnResult === "completed") {
        this.preTurnSnapshot = null;
        await this.emit({
          type: "completed",
          summary: this.lastSummary,
        });
        return;
      }
      if (turnResult === "ask_user") {
        return;
      }
    }

    if (maxTurns <= 0) {
      this.status = "completed";
      this.lastSummary = "Planning reached maximum number of turns.";
      this.preTurnSnapshot = null;
      await this.emit({
        type: "completed",
        summary: this.lastSummary,
      });
    }
  }

  private async processTurn(response: LLMMessage): Promise<"completed" | "ask_user" | "continue"> {
    this.messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      // LLM stopped calling tools — planning complete
      this.status = "completed";
      this.lastSummary = response.content;
      this.lastReasoning = response.reasoning ?? "";
      return "completed";
    }

    for (const toolCall of response.tool_calls) {
      const result = await this.dispatchTool(toolCall);
      if (result.type === "ask_user") {
        for (const skippedToolCall of response.tool_calls.slice(
          response.tool_calls.indexOf(toolCall) + 1
        )) {
          this.messages.push({
            role: "tool",
            content: JSON.stringify({
              error: "Skipped because planning is waiting for user input",
            }),
            tool_call_id: skippedToolCall.id,
          });
        }
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
        return "ask_user";
      }
      if (result.type === "error") {
        throw new Error(`Tool ${toolCall.function.name} failed: ${result.result.error}`);
      }
      this.messages.push({
        role: "tool",
        content: JSON.stringify(result.result),
        tool_call_id: toolCall.id,
      });
    }

    return "continue";
  }

  private rollbackToTurnStart(): void {
    if (this.preTurnSnapshot) this.store.revert(this.preTurnSnapshot);
  }

  private async handleFailure(err: unknown): Promise<never> {
    this.rollbackToTurnStart();
    this.status = "error";
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ conversationId: this.conversationId, error }, "[planning-session] failed");
    await this.emit({ type: "error", error });
    throw err;
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

    logger.debug(
      { conversationId: this.conversationId, toolName, params },
      "[planning-session] dispatching tool"
    );

    await this.emit({ type: "tool_called", toolName, params });

    try {
      const tool = getTool(toolName);
      const result = tool.plan(params, this.store);

      logger.debug(
        { conversationId: this.conversationId, toolName, result },
        "[planning-session] tool succeeded"
      );

      await this.emit({ type: "tool_result", toolName, result });

      if (toolName === "ask_user") {
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
      logger.error(
        { conversationId: this.conversationId, toolName, error },
        "[planning-session] tool failed"
      );
      await this.emit({ type: "tool_result", toolName, result: { error } });
      return { type: "error", result: { error } };
    }
  }

  // ── LLM Integration ────────────────────────────────────────────────────────

  /**
   * Trim the conversation history to keep request size bounded. Keeps the
   * system prompt (index 0) plus the most recent MESSAGES_WINDOW messages.
   */
  private trimMessages(): void {
    const MESSAGES_WINDOW = 50;
    if (this.messages.length <= MESSAGES_WINDOW) return;
    const dropped = this.messages.length - MESSAGES_WINDOW;
    this.messages = [this.messages[0]!, ...this.messages.slice(1 + dropped)];
  }

  private async callLLM(): Promise<LLMMessage> {
    const functions = getOpenAIFunctionDefinitions();
    this.trimMessages();
    const modelConfig = await this.getModelConfig();

    const baseUrl = process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1";
    const model = modelConfig.modelId;
    const apiKey = process.env.LLM_API_KEY;
    const isDevEnv = process.env.NODE_ENV !== "production";

    if (!apiKey) {
      if (isDevEnv) {
        return this.mockLLMResponse();
      }
      throw new Error(
        "LLM_API_KEY is not configured. Planning requires an LLM provider in production."
      );
    }

    const request = buildLLMRequest({
      baseUrl,
      apiKey,
      model,
      messages: prepareMessagesForModel(this.messages, model),
      functions,
      reasoning: modelConfig.reasoning,
      webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:5173",
      abortSignal: this.abortController.signal,
    });

    logger.info(
      {
        conversationId: this.conversationId,
        url: request.url,
        model,
        messageCount: this.messages.length,
      },
      "[planning-session] calling LLM"
    );

    const fetchStart = Date.now();
    const fetchResponse = await fetch(request.url, request.fetchOptions);

    if (!fetchResponse.ok) {
      const text = await fetchResponse.text();
      logger.error(
        {
          conversationId: this.conversationId,
          status: fetchResponse.status,
          body: text.slice(0, 500),
        },
        "[planning-session] LLM provider error"
      );
      throw new Error(`LLM provider error ${fetchResponse.status}: ${text}`);
    }

    if (!fetchResponse.body) {
      throw new Error("LLM provider returned empty body");
    }

    const result = await parseOpenRouterStream(fetchResponse.body);

    logger.info(
      {
        conversationId: this.conversationId,
        status: fetchResponse.status,
        durationMs: Date.now() - fetchStart,
        toolCallCount: result.toolCalls.length,
        contentChars: result.content.length,
        reasoningChars: result.reasoning.length,
      },
      "[planning-session] LLM response received"
    );

    // Only emit displayable assistant content. Provider reasoning remains in
    // persisted history for compatible follow-up calls and plan audit data.
    await this.emit({
      type: "turn_completed",
      summary: result.content.slice(0, 200),
    });

    // Build final LLM message from accumulated result
    return {
      role: "assistant",
      content: result.content,
      modelId: model,
      reasoning: result.reasoning || undefined,
      reasoning_details: result.reasoningDetails.length ? result.reasoningDetails : undefined,
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

  private mockLLMResponse(): LLMMessage {
    // Development fallback when no API key is configured
    return {
      role: "assistant",
      content: "I have updated the server configuration based on your request.",
    };
  }

  // ── System Prompt ──────────────────────────────────────────────────────────

  private buildSystemPrompt(serverState: ServerState): string {
    const sections = [
      SHARED_CORE_PROMPT,
      SERVER_PLANNER_PROMPT,
      [
        "## Current Server State",
        "<current_server_state>",
        formatGuildForLLM(serverState.guildId, serverState.guildName, serverState.memberCount),
        "</current_server_state>",
      ].join("\n"),
    ];

    if (this.guildRules.length > 0) {
      sections.push(
        [
          "## Guild-Specific Rules",
          "<guild_rules>",
          ...this.guildRules.map((rule, index) => `${index + 1}. ${rule}`),
          "</guild_rules>",
        ].join("\n")
      );
    }

    if (this.activeTemplates.length > 0) {
      sections.push(
        [
          "## Attached Template Baselines",
          "<attached_templates>",
          JSON.stringify(this.activeTemplates, null, 2),
          "</attached_templates>",
        ].join("\n")
      );
    }

    const toolLines = ["## Available Tools"];
    for (const tool of getOpenAIFunctionDefinitions()) {
      toolLines.push(`- ${tool.function.name}: ${tool.function.description}`);
    }
    sections.push(toolLines.join("\n"));

    return sections.join("\n\n");
  }
}
