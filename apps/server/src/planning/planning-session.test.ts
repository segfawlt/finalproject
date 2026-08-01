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

  it("retains the forked server context when template context rebuilds the prompt", () => {
    const session = new PlanningSession({
      guildId: "guild-1",
      conversationId: "conversation-template-context",
      userPrompt: "Create a community space",
      forkStateHash: "state-hash",
      serverState: {
        guildId: "guild-1",
        guildName: "Community",
        memberCount: 42,
        channels: [],
        roles: [],
        overwrites: [],
      },
      emit: async () => {},
    });

    session.addTemplate({ id: "template-1", name: "Staff", summary: "Private staff area" });

    expect(session.getMessages()[0]?.content).toContain("Server: Community (42 members)");
    expect(session.getMessages()[0]?.content).toContain("Staff: Private staff area");
  });

  it("keeps guild rules in the initial and rebuilt planning prompts", () => {
    const session = new PlanningSession({
      guildId: "guild-1",
      conversationId: "conversation-rule-context",
      userPrompt: "Create a community space",
      forkStateHash: "state-hash",
      serverState: {
        guildId: "guild-1",
        guildName: "Community",
        memberCount: 42,
        channels: [],
        roles: [],
        overwrites: [],
      },
      guildRules: ["Never delete the announcements channel."],
      emit: async () => {},
    });

    expect(session.getMessages()[0]?.content).toContain(
      "1. Never delete the announcements channel."
    );

    session.addTemplate({ id: "template-1", name: "Staff", summary: "Private staff area" });

    expect(session.getMessages()[0]?.content).toContain(
      "1. Never delete the announcements channel."
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

  it("does not announce completion when iteration persistence fails", async () => {
    vi.stubEnv("LLM_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createSseResponse([{ content: "Done." }]))
    );

    const events: string[] = [];
    const session = new PlanningSession({
      guildId: "guild-1",
      conversationId: "conversation-persistence-failure",
      userPrompt: "Create a channel",
      forkStateHash: "state-hash",
      serverState: {
        guildId: "guild-1",
        guildName: "Community",
        memberCount: 1,
        channels: [],
        roles: [],
        overwrites: [],
      },
      emit: async (event) => {
        events.push(event.type);
      },
      onTurnComplete: async () => {
        throw new Error("database unavailable");
      },
    });

    await expect(session.start()).rejects.toThrow("database unavailable");
    expect(session.status).toBe("error");
    expect(events).toContain("error");
    expect(events).not.toContain("completed");
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
