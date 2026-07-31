import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanningSession } from "./planning-session";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PlanningSession repair context", () => {
  it("forks fresh server state and appends repair context after prior messages", () => {
    const session = new PlanningSession({
      guildId: "guild-1",
      conversationId: "conversation-1",
      userPrompt: "Create a community space",
      forkStateHash: "fresh-hash",
      serverState: {
        guildId: "guild-1",
        guildName: "Community",
        memberCount: 1,
        channels: [{ id: "channel-1", name: "lobby", type: 0, parentId: null, position: 0 }],
        roles: [],
        overwrites: [],
      },
      messages: [{ role: "user", content: "Create a community space" }],
      repairPrompt: "Repair conflict: channel general was deleted.",
      emit: async () => {},
    });

    expect(session.getDesiredState().active.channels["channel-1"]?.name).toBe("lobby");
    expect(session.getMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Create a community space" }),
        expect.objectContaining({
          role: "user",
          content: "Repair conflict: channel general was deleted.",
        }),
      ])
    );
  });
});

describe("PlanningSession planning-only tools", () => {
  it("continues planning after batch_set_overwrite instead of pausing for user input", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");

    const responses = [
      createSseResponse([
        {
          tool_calls: [
            {
              index: 0,
              id: "call-1",
              function: {
                name: "batch_set_overwrite",
                arguments: JSON.stringify({
                  overwrites: [
                    {
                      channel_id: "channel-1",
                      role_id: "role-1",
                      allow: ["VIEW_CHANNEL"],
                      deny: [],
                    },
                  ],
                }),
              },
            },
          ],
        },
      ]),
      createSseResponse([{ content: "Permission overwrites planned." }]),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => responses.shift() ?? createSseResponse([{ content: "Done." }]))
    );

    const events: string[] = [];
    const session = new PlanningSession({
      guildId: "guild-1",
      conversationId: "conversation-1",
      userPrompt: "Make the lobby visible to moderators",
      forkStateHash: "state-hash",
      serverState: {
        guildId: "guild-1",
        guildName: "Community",
        memberCount: 1,
        channels: [{ id: "channel-1", name: "lobby", type: 0, parentId: null, position: 0 }],
        roles: [
          {
            id: "role-1",
            name: "Moderator",
            position: 1,
            permissions: [],
            color: 0,
            hoist: false,
            mentionable: false,
          },
        ],
        overwrites: [],
      },
      emit: async (event) => {
        events.push(event.type);
      },
    });

    await session.start();

    expect(session.status).toBe("completed");
    expect(events).not.toContain("ask_user");
    expect(session.getDesiredState().active.overwrites["channel-1:role-1"]).toMatchObject({
      allow: ["VIEW_CHANNEL"],
      deny: [],
    });
  });
});

function createSseResponse(
  chunks: Array<{
    content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      function: { name?: string; arguments?: string };
    }>;
  }>
): Response {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const data = JSON.stringify({ choices: [{ delta: chunk }] });
        controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(body, { status: 200 });
}
