// @vitest-environment jsdom
import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTemplateAuthoring } from "./useTemplateAuthoring";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../lib/api", () => ({ apiFetch }));

class MockEventSource {
  static latest: MockEventSource | undefined;
  listeners = new Map<string, (event: Event) => void>();
  close = vi.fn();
  constructor(public url: string) {
    MockEventSource.latest = this;
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, listener);
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}
vi.stubGlobal("EventSource", MockEventSource);

describe("useTemplateAuthoring", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(new Response(JSON.stringify([])));
  });
  it("streams tool events and refreshes only after completion", async () => {
    const changed = vi.fn();
    const { result } = renderHook(() => useTemplateAuthoring("template", changed));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/templates/template/turns"));
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "turn" }), { status: 202 }));
    await act(async () => result.current.submit("add channels"));
    const stream = MockEventSource.latest!;
    await act(async () => stream.emit("tool_called", { toolName: "create_channel" }));
    expect(result.current.events).toHaveLength(1);
    expect(changed).not.toHaveBeenCalled();
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify([])));
    await act(async () => stream.emit("completed", { summary: "saved" }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  });

  it("sends the selected model configuration with an authoring turn", async () => {
    const { result } = renderHook(() => useTemplateAuthoring("template", vi.fn()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/templates/template/turns"));
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "turn" }), { status: 202 }));

    await act(async () =>
      result.current.submit("add channels", {
        modelId: "openai/gpt-4o-mini",
        reasoning: { effort: "high" },
      })
    );

    expect(apiFetch).toHaveBeenCalledWith("/api/templates/template/turns", {
      method: "POST",
      body: {
        prompt: "add channels",
        modelConfig: { modelId: "openai/gpt-4o-mini", reasoning: { effort: "high" } },
      },
    });
  });
  it("closes an earlier stream and supports ask_user answers and cancellation", async () => {
    const { result } = renderHook(() => useTemplateAuthoring("template", vi.fn()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    apiFetch.mockImplementation(async (path: string) =>
      path.endsWith("/turns") && !path.includes("/turn/")
        ? new Response(JSON.stringify({ id: "turn" }), { status: 202 })
        : new Response("{}", { status: 200 })
    );
    await act(async () => result.current.submit("first"));
    const first = MockEventSource.latest!;
    await act(async () => result.current.submit("second"));
    expect(first.close).toHaveBeenCalled();
    await act(async () => MockEventSource.latest!.emit("ask_user", { question: "Which?" }));
    expect(result.current.status).toBe("waiting_for_user");
    apiFetch.mockResolvedValue(new Response("{}", { status: 200 }));
    await act(async () => result.current.answer("one"));
    await act(async () => result.current.cancel());
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/templates/template/turns/turn/answer",
      expect.anything()
    );
  });

  it("refetches persisted turns and clears the active stream after cancellation", async () => {
    const { result } = renderHook(() => useTemplateAuthoring("template", vi.fn()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "turn" }), { status: 202 }));
    await act(async () => result.current.submit("cancel me"));
    apiFetch.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "turn", prompt: "cancel me", status: "cancelled" }]))
    );

    await act(async () => result.current.cancel());

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.turns[0]?.status).toBe("cancelled");
  });

  it("refetches persisted turns while leaving terminal provider errors visible", async () => {
    const { result } = renderHook(() => useTemplateAuthoring("template", vi.fn()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: "turn" }), { status: 202 }));
    await act(async () => result.current.submit("fail me"));
    const stream = MockEventSource.latest!;
    apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "turn", prompt: "fail me", status: "error" }]))
    );

    await act(async () => stream.emit("error", { error: "provider failed" }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.activeTurnId).toBeNull();
    expect(result.current.turns[0]?.status).toBe("error");
  });
});
