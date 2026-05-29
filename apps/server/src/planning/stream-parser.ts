interface ToolCallAccumulator {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface StreamParseResult {
  thinking: string;
  toolCalls: ToolCallAccumulator[];
}

interface StreamParseOptions {
  onToolCall?: (toolCall: ToolCallAccumulator) => void | Promise<void>;
}

/**
 * Parse an OpenRouter SSE stream.
 *
 * Accumulates thinking text and tool call arguments from streaming deltas.
 * Calls onToolCall for each tool call as soon as its arguments are complete.
 *
 * Returns the full accumulated result after the stream ends.
 */
export async function parseOpenRouterStream(
  stream: ReadableStream<Uint8Array>,
  options?: StreamParseOptions
): Promise<StreamParseResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let thinking = "";
  const toolCallAccumulators = new Map<number, ToolCallAccumulator>();
  const completedToolCalls: ToolCallAccumulator[] = [];

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines from buffer
      const lines = buffer.split("\n");
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  type?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };

          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Accumulate thinking text
          if (delta.content) {
            thinking += delta.content;
          }

          // Accumulate tool calls
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
                // Merge deltas
                if (tcDelta.id) accumulator.id = tcDelta.id;
                if (tcDelta.type) accumulator.type = tcDelta.type;
                if (tcDelta.function?.name) {
                  accumulator.function.name = tcDelta.function.name;
                }
                if (tcDelta.function?.arguments) {
                  accumulator.function.arguments += tcDelta.function.arguments;
                }
              }

              // Check if this tool call is complete (has both name and full arguments)
              // We detect completion when the next delta is a different index or content
              // For now, we'll detect completion heuristically
            }
          }

          // Detect completed tool calls: if we received content after tool calls,
          // or if there's a gap in tool call indices, previous ones are complete
          if (delta.content && toolCallAccumulators.size > 0) {
            for (const [idx, tc] of toolCallAccumulators) {
              if (tc.function.name && tc.function.arguments) {
                completedToolCalls.push(tc);
                await options?.onToolCall?.(tc);
                toolCallAccumulators.delete(idx);
              }
            }
          }
        } catch {
          // Ignore malformed JSON in SSE stream
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string; tool_calls?: unknown[] } }>;
            };
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) {
              thinking += delta.content;
            }
          } catch {
            // Ignore
          }
        }
      }
    }

    // Flush remaining tool calls
    for (const [idx, tc] of toolCallAccumulators) {
      if (tc.function.name && tc.function.arguments) {
        completedToolCalls.push(tc);
        await options?.onToolCall?.(tc);
      }
      toolCallAccumulators.delete(idx);
    }
  } finally {
    reader.releaseLock();
  }

  return {
    thinking,
    toolCalls: completedToolCalls,
  };
}
