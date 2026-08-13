import {
  DesiredStateStore,
  getOpenAIFunctionDefinitions,
  getTool,
  TEMPLATE_TOOL_NAMES,
} from "@repo/shared";
import type { DesiredState } from "@repo/shared";
import { buildLLMRequest } from "./llm-request";
import { parseOpenRouterStream } from "./stream-parser";
import { prepareMessagesForModel, type LLMMessage } from "./planning-session";
import { SHARED_CORE_PROMPT, TEMPLATE_AUTHORING_PROMPT } from "./system-prompts";
import type { TemplateEvent } from "./template-event-bus";
import type { ConversationModelConfig } from "./model-config";

export type TemplateStatus = "idle" | "planning" | "waiting_for_user" | "completed" | "error";
export type PlanningEventEmitter = (event: TemplateEvent) => void | Promise<void>;

export interface TemplateLLMRequest {
  messages: LLMMessage[];
  functions: unknown[];
  model: string;
  reasoning?: ConversationModelConfig["reasoning"];
  abortSignal: AbortSignal;
}

interface TemplateSessionOptions {
  templateId: string;
  turnId: string;
  creatorId: string;
  prompt: string;
  initialState: DesiredState;
  modelConfig?: ConversationModelConfig;
  messages?: LLMMessage[];
  emit: PlanningEventEmitter;
  invokeLLM?: (request: TemplateLLMRequest) => Promise<LLMMessage>;
  onStateChange: (session: TemplateSession) => Promise<void>;
  onComplete: (session: TemplateSession, changed: boolean) => Promise<void>;
}

export class TemplateSession {
  readonly templateId: string;
  readonly turnId: string;
  readonly creatorId: string;
  readonly store: DesiredStateStore;
  messages: LLMMessage[];
  status: TemplateStatus = "idle";
  lastSummary = "";
  private readonly emit: PlanningEventEmitter;
  private readonly onStateChange: TemplateSessionOptions["onStateChange"];
  private readonly onComplete: TemplateSessionOptions["onComplete"];
  private readonly invokeLLM: (request: TemplateLLMRequest) => Promise<LLMMessage>;
  private abortController = new AbortController();
  private preTurnSnapshot: DesiredState | null = null;
  private readonly initialSnapshot: DesiredState;
  private readonly modelConfig: ConversationModelConfig;
  private pendingAskUser: { id: string; params: Record<string, unknown> } | null = null;

  constructor(options: TemplateSessionOptions) {
    this.templateId = options.templateId;
    this.turnId = options.turnId;
    this.creatorId = options.creatorId;
    this.store = new DesiredStateStore(
      JSON.parse(JSON.stringify(options.initialState)) as DesiredState
    );
    this.initialSnapshot = this.store.snapshot();
    this.modelConfig = options.modelConfig ?? {
      modelId: process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
    };
    this.emit = options.emit;
    this.onStateChange = options.onStateChange;
    this.onComplete = options.onComplete;
    this.invokeLLM = options.invokeLLM ?? defaultInvokeLLM;
    this.messages = [
      {
        role: "system",
        content: this.buildSystemPrompt(),
      },
      ...(options.messages ?? []).filter((message) => message.role !== "system"),
    ];
    this.messages.push({ role: "user", content: options.prompt });
  }

  async start(): Promise<void> {
    this.status = "planning";
    this.abortController = new AbortController();
    if (!this.preTurnSnapshot) this.preTurnSnapshot = this.store.snapshot();
    try {
      await this.runLoop();
    } catch (error) {
      if (this.preTurnSnapshot) this.store.revert(this.preTurnSnapshot);
      if (this.abortController.signal.aborted) throw error;
      this.status = "error";
      await this.emit({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async resume(answer: string): Promise<void> {
    if (this.status !== "waiting_for_user" || !this.pendingAskUser) {
      throw new Error("Cannot resume: not paused on ask_user");
    }
    this.messages.push({ role: "tool", content: answer, tool_call_id: this.pendingAskUser.id });
    this.pendingAskUser = null;
    this.status = "planning";
    await this.start();
  }

  cancel(reason = "User cancelled"): void {
    this.status = "idle";
    this.abortController.abort(reason);
    if (this.preTurnSnapshot) this.store.revert(this.preTurnSnapshot);
  }

  getDesiredState(): DesiredState {
    return this.store.getState();
  }
  getMessages(): LLMMessage[] {
    return [...this.messages];
  }

  private async runLoop(): Promise<void> {
    for (let turn = 0; this.status === "planning" && turn < 20; turn++) {
      await this.emit({ type: "turn_started" });
      const response = await this.invokeWithCancellation();
      this.messages.push(response);
      await this.emit({ type: "turn_completed", summary: response.content.slice(0, 200) });
      if (!response.tool_calls?.length) {
        this.status = "completed";
        this.lastSummary = response.content;
        const changed =
          JSON.stringify(this.store.getState()) !== JSON.stringify(this.initialSnapshot);
        await this.onComplete(this, changed);
        await this.emit({ type: "completed", summary: this.lastSummary });
        return;
      }
      for (const call of response.tool_calls) {
        const result = await this.dispatchTool(call);
        if (
          result.type === "error" &&
          (TEMPLATE_TOOL_NAMES as readonly string[]).includes(call.function.name)
        ) {
          throw new Error(`Tool ${call.function.name} failed: ${result.error}`);
        }
        this.messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: call.id,
        });
        if (result.type === "ask_user") {
          this.status = "waiting_for_user";
          this.pendingAskUser = { id: call.id, params: result.params as Record<string, unknown> };
          await this.onStateChange(this);
          await this.emit({ type: "ask_user", ...(result.params as Record<string, unknown>) });
          return;
        }
      }
    }
    this.status = "completed";
    this.lastSummary = "Template planning reached maximum number of turns.";
    const changed = JSON.stringify(this.store.getState()) !== JSON.stringify(this.initialSnapshot);
    await this.onComplete(this, changed);
    await this.emit({ type: "completed", summary: this.lastSummary });
  }

  private async dispatchTool(
    call: NonNullable<LLMMessage["tool_calls"]>[number]
  ): Promise<Record<string, unknown>> {
    const params = JSON.parse(call.function.arguments) as Record<string, unknown>;
    await this.emit({ type: "tool_called", toolName: call.function.name, params });
    if (!(TEMPLATE_TOOL_NAMES as readonly string[]).includes(call.function.name)) {
      const result = {
        type: "error",
        error: `Tool ${call.function.name} is unavailable in template authoring`,
      };
      await this.emit({ type: "tool_result", toolName: call.function.name, result });
      return result;
    }
    try {
      const tool = getTool(call.function.name);
      const result = tool.plan(params, this.store);
      await this.emit({ type: "tool_result", toolName: call.function.name, result });
      return call.function.name === "ask_user"
        ? { type: "ask_user", params }
        : { type: "success", result };
    } catch (error) {
      const result = {
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      await this.emit({ type: "tool_result", toolName: call.function.name, result });
      return result;
    }
  }

  private async invokeWithCancellation(): Promise<LLMMessage> {
    const request = this.createRequest();
    return Promise.race([
      this.invokeLLM(request),
      new Promise<LLMMessage>((_, reject) =>
        this.abortController.signal.addEventListener(
          "abort",
          () => reject(new Error("Template planning cancelled")),
          { once: true }
        )
      ),
    ]);
  }

  private createRequest(): TemplateLLMRequest {
    return {
      messages: prepareMessagesForModel(this.messages, this.modelConfig.modelId),
      functions: getOpenAIFunctionDefinitions(TEMPLATE_TOOL_NAMES),
      model: this.modelConfig.modelId,
      reasoning: this.modelConfig.reasoning,
      abortSignal: this.abortController.signal,
    };
  }

  private buildSystemPrompt(): string {
    const state = this.store.getState();
    const toolLines = ["## Available Tools"];
    for (const tool of getOpenAIFunctionDefinitions(TEMPLATE_TOOL_NAMES)) {
      toolLines.push(`- ${tool.function.name}: ${tool.function.description}`);
    }

    return [
      SHARED_CORE_PROMPT,
      TEMPLATE_AUTHORING_PROMPT,
      [
        "## Current Template Structure",
        "<current_template_structure>",
        JSON.stringify({ active: state.active, tombstones: state.tombstones }, null, 2),
        "</current_template_structure>",
      ].join("\n"),
      toolLines.join("\n"),
    ].join("\n\n");
  }
}

async function defaultInvokeLLM(input: TemplateLLMRequest): Promise<LLMMessage> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is not configured");
  const request = buildLLMRequest({
    baseUrl: process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey,
    model: input.model,
    messages: input.messages,
    functions: input.functions,
    reasoning: input.reasoning,
    webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:5173",
    abortSignal: input.abortSignal,
  });
  const response = await fetch(request.url, request.fetchOptions);
  if (!response.ok)
    throw new Error(`LLM provider error ${response.status}: ${await response.text()}`);
  if (!response.body) throw new Error("LLM provider returned empty body");
  const parsed = await parseOpenRouterStream(response.body);
  return {
    role: "assistant",
    content: parsed.content,
    modelId: input.model,
    reasoning: parsed.reasoning || undefined,
    reasoning_details: parsed.reasoningDetails.length ? parsed.reasoningDetails : undefined,
    tool_calls: parsed.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.function.name, arguments: call.function.arguments },
    })),
  };
}
