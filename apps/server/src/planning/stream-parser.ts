import { logger } from "../utils/logger";

interface ToolCallAccumulator {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamParseResult {
  /** @deprecated Use content for normal assistant text. */
  thinking: string;
  content: string;
  reasoning: string;
  reasoningDetails: unknown[];
  toolCalls: ToolCallAccumulator[];
}

/**
 * Parse an OpenRouter SSE stream.
 *
 * Returns the full assistant response only after the stream ends.
 */
export async function parseOpenRouterStream(
  stream: ReadableStream<Uint8Array>
): Promise<StreamParseResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let content = "";
  let reasoning = "";
  const reasoningDetails = new Map<number, Record<string, unknown>>();
  const toolCallAccumulators = new Map<number, ToolCallAccumulator>();

  let buffer = "";
  let malformedLineCount = 0;

  const accumulateDelta = (delta: {
    content?: string;
    reasoning?: string;
    reasoning_details?: Array<Record<string, unknown> & { index?: number }>;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string };
    }>;
  }) => {
    // Keep displayable answer text independent from provider reasoning.
    if (delta.content) {
      content += delta.content;
    }
    if (delta.reasoning) {
      reasoning += delta.reasoning;
    }
    if (delta.reasoning_details) {
      for (const detail of delta.reasoning_details) {
        if (typeof detail.index !== "number") continue;
        const current = reasoningDetails.get(detail.index) ?? { index: detail.index };
        for (const [key, value] of Object.entries(detail)) {
          if (key === "text" && typeof value === "string") {
            current.text = `${typeof current.text === "string" ? current.text : ""}${value}`;
          } else if (value !== undefined && isNonEmpty(value)) {
            current[key] = value;
          }
        }
        reasoningDetails.set(detail.index, current);
      }
    }

    if (delta.tool_calls) {
      for (const tcDelta of delta.tool_calls) {
        const index = tcDelta.index;
        let accumulator = toolCallAccumulators.get(index);

        if (!accumulator) {
          accumulator = {
            id: tcDelta.id ?? "",
            type: tcDelta.type ?? "function",
            function: {
              name: tcDelta.function?.name ?? "",
              arguments: tcDelta.function?.arguments ?? "",
            },
          };
          toolCallAccumulators.set(index, accumulator);
        } else {
          if (tcDelta.id) accumulator.id = tcDelta.id;
          if (tcDelta.type) accumulator.type = tcDelta.type;
          if (tcDelta.function?.name) {
            accumulator.function.name = tcDelta.function.name;
          }
          if (tcDelta.function?.arguments) {
            accumulator.function.arguments += tcDelta.function.arguments;
          }
        }
      }
    }
  };

  const accumulateDataRecord = (data: string) => {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: Parameters<typeof accumulateDelta>[0];
        }>;
      };
      const delta = parsed.choices?.[0]?.delta;
      if (delta) accumulateDelta(delta);
    } catch {
      // Ignore malformed JSON in SSE stream.
      malformedLineCount += 1;
    }
  };

  logger.debug("[stream-parser] starting");

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from buffer.
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        accumulateDataRecord(trimmed.slice(5).trimStart());
      }
    }

    buffer += decoder.decode();
    // Process remaining buffer. Providers normally terminate each SSE record
    // with a newline, but accept a final unterminated content delta too.
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data:")) {
        accumulateDataRecord(trimmed.slice(5).trimStart());
      }
    }
  } finally {
    reader.releaseLock();
  }

  logger.debug(
    {
      toolCallCount: toolCallAccumulators.size,
      contentChars: content.length,
      reasoningChars: reasoning.length,
      malformedLineCount,
    },
    "[stream-parser] finished"
  );

  return {
    thinking: content,
    content,
    reasoning,
    reasoningDetails: [...reasoningDetails.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, detail]) => detail),
    toolCalls: [...toolCallAccumulators.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, toolCall]) => toolCall)
      .filter((toolCall) => toolCall.function.name && toolCall.function.arguments),
  };
}

function isNonEmpty(value: unknown): boolean {
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null;
}
