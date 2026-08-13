// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConversation } from "./useConversation";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("../lib/api", () => ({ apiFetch }));

describe("useConversation", () => {
  let conversationResponse: Response;

  beforeEach(() => {
    conversationResponse = new Response(
      JSON.stringify({
        userPrompt: "Create a project space",
        messages: [
          { role: "user", content: "Create a project space" },
          { role: "assistant", content: "I drafted the initial structure." },
          { role: "assistant", content: "I created the project space." },
        ],
        iterations: [
          {
            id: "iteration-1",
            version: 1,
            type: "llm_generated",
            desiredState: { active: { roles: [] }, tombstones: [] },
            createdAt: "2026-08-13T00:00:00.000Z",
          },
          {
            id: "iteration-2",
            version: 2,
            type: "manual_edit",
            desiredState: { active: {}, tombstones: [] },
            createdAt: "2026-08-13T01:00:00.000Z",
          },
        ],
      }),
      { status: 200 }
    );
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/settings/models") {
        return Promise.resolve(
          new Response(JSON.stringify({ modelIds: ["model-1"], models: [] }), { status: 200 })
        );
      }
      if (path === "/api/guilds/guild-1/conversations/conversation-1") {
        return Promise.resolve(conversationResponse.clone());
      }
      if (path === "/api/guilds/guild-1/state") {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
  });

  it("hydrates the saved prompt, assistant summary, and latest iteration for a past conversation", async () => {
    const { result } = renderHook(() => useConversation({ guildId: "guild-1" }));

    await act(async () => result.current.loadConversation("conversation-1"));

    await waitFor(() => expect(result.current.summary).toBe("I created the project space."));
    expect(result.current.prompt).toBe("Create a project space");
    expect(result.current.phase).toBe("completed");
    expect(result.current.desiredState).toEqual({ active: {}, tombstones: [] });
  });

  it("clears the previous conversation when loading another history item fails", async () => {
    const { result } = renderHook(() => useConversation({ guildId: "guild-1" }));

    await act(async () => result.current.loadConversation("conversation-1"));
    conversationResponse = new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
    });

    await act(async () => result.current.loadConversation("conversation-1"));

    expect(result.current.prompt).toBe("");
    expect(result.current.summary).toBe("");
    expect(result.current.desiredState).toBeNull();
    expect(result.current.iterations).toEqual([]);
    expect(result.current.error).toBe("Conversation not found");
  });

  it("sends pending template IDs with the first planning prompt", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/api/settings/models") {
        return Promise.resolve(
          new Response(JSON.stringify({ modelIds: ["model-1"], models: [] }), { status: 200 })
        );
      }
      if (path === "/api/guilds/guild-1/conversations") {
        return Promise.resolve(new Response(JSON.stringify({ id: "conversation-1" }), { status: 201 }));
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const { result } = renderHook(() => useConversation({ guildId: "guild-1" }));

    act(() => result.current.setActiveTemplates([{ id: "template-1", name: "Community" }]));
    await act(async () => result.current.createConversation("Create a community server"));

    expect(apiFetch).toHaveBeenCalledWith("/api/guilds/guild-1/conversations", {
      method: "POST",
      body: {
        userPrompt: "Create a community server",
        modelConfig: undefined,
        templateIds: ["template-1"],
      },
    });
  });
});
