import { describe, it, expect } from "vitest";
import { parseOpenRouterStream } from "./stream-parser";

describe("parseOpenRouterStream", () => {
  it("accumulates thinking text from content deltas", async () => {
    const chunks = [{ content: "Let" }, { content: " me" }, { content: " think..." }];

    const result = await parseOpenRouterStream(createStream(chunks));

    expect(result.thinking).toBe("Let me think...");
    expect(result.toolCalls).toHaveLength(0);
  });

  it("accumulates tool call arguments from deltas", async () => {
    const chunks = [
      {
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "create_channel", arguments: "" } },
        ],
      },
      { tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] },
      { tool_calls: [{ index: 0, function: { arguments: '"staff-chat"}' } }] },
    ];

    const result = await parseOpenRouterStream(createStream(chunks));

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].function.name).toBe("create_channel");
    expect(result.toolCalls[0].function.arguments).toBe('{"name":"staff-chat"}');
  });

  it("handles multiple tool calls", async () => {
    const chunks = [
      {
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "create_channel", arguments: "" } },
        ],
      },
      { tool_calls: [{ index: 0, function: { arguments: '{"name":"general"}' } }] },
      {
        tool_calls: [{ index: 1, id: "call_2", function: { name: "create_role", arguments: "" } }],
      },
      { tool_calls: [{ index: 1, function: { arguments: '{"name":"admin"}' } }] },
    ];

    const result = await parseOpenRouterStream(createStream(chunks));

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].function.name).toBe("create_channel");
    expect(result.toolCalls[1].function.name).toBe("create_role");
  });

  it("yields completed tool calls as they finish", async () => {
    const chunks = [
      { content: "Let me" },
      {
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "create_channel", arguments: "" } },
        ],
      },
      { tool_calls: [{ index: 0, function: { arguments: '{"name":"chat"}' } }] },
    ];

    const yielded: unknown[] = [];
    await parseOpenRouterStream(createStream(chunks), {
      onToolCall: (tc) => {
        yielded.push(tc);
      },
    });

    expect(yielded).toHaveLength(1);
    expect((yielded[0] as { function: { name: string } }).function.name).toBe("create_channel");
  });
});

function createStream(
  chunks: Array<{
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function: { name?: string; arguments?: string };
    }>;
  }>
) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const data = JSON.stringify({
          choices: [{ delta: chunk }],
        });
        controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
      }
      controller.close();
    },
  });
}
