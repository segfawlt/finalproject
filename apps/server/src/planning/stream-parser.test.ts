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

  it("keeps answer content separate from streamed reasoning and merges reasoning details", async () => {
    const result = await parseOpenRouterStream(
      createStream([
        { reasoning: "Inspect ", content: "I will " },
        {
          reasoning: "channels.",
          reasoning_details: [{ index: 0, type: "reasoning.text", text: "Inspect " }],
          content: "make the change.",
        },
        {
          reasoning_details: [
            { index: 0, type: "reasoning.text", text: "channels.", format: "native" },
          ],
        },
      ])
    );

    expect(result.content).toBe("I will make the change.");
    expect(result.reasoning).toBe("Inspect channels.");
    expect(result.reasoningDetails).toEqual([
      { index: 0, type: "reasoning.text", text: "Inspect channels.", format: "native" },
    ]);
  });

  it("accumulates every delta from an unterminated final SSE record", async () => {
    const finalDelta = {
      content: "Done.",
      reasoning: "Final reasoning.",
      reasoning_details: [{ index: 0, type: "reasoning.text", text: "Final reasoning." }],
      tool_calls: [
        {
          index: 0,
          id: "call-1",
          function: { name: "create_channel", arguments: '{"name":"staff"}' },
        },
      ],
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: finalDelta }] })}`)
        );
        controller.close();
      },
    });

    await expect(parseOpenRouterStream(stream)).resolves.toMatchObject({
      content: "Done.",
      reasoning: "Final reasoning.",
      reasoningDetails: [{ index: 0, type: "reasoning.text", text: "Final reasoning." }],
      toolCalls: [
        {
          id: "call-1",
          function: { name: "create_channel", arguments: '{"name":"staff"}' },
        },
      ],
    });
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

  it("returns tool calls only after the stream ends", async () => {
    const chunks = [
      { content: "Let me" },
      {
        tool_calls: [
          { index: 0, id: "call_1", function: { name: "create_channel", arguments: "" } },
        ],
      },
      { tool_calls: [{ index: 0, function: { arguments: '{"name":"chat"}' } }] },
    ];

    const result = await parseOpenRouterStream(createStream(chunks));

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("create_channel");
  });
});

function createStream(
  chunks: Array<{
    content?: string;
    reasoning?: string;
    reasoning_details?: Array<Record<string, unknown> & { index: number }>;
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
