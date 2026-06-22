import { describe, it, expect, beforeEach } from "vitest";
import { useStudioStore, makeTab, type StudioPhase } from "./studioStore";

function resetStore() {
  useStudioStore.setState({
    openTabs: [makeTab("server"), makeTab("desired")],
    activeTab: "server",
    conversationId: null,
    planId: null,
    phase: "input" as StudioPhase,
    error: "",
    activeTemplates: [],
    selectedItems: [],
    selectedGuild: null,
    isDragging: false,
  });
}

describe("useStudioStore", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("tab state", () => {
    it("initializes with server and desired tabs, server active", () => {
      const state = useStudioStore.getState();
      expect(state.openTabs).toHaveLength(2);
      expect(state.openTabs[0]?.type).toBe("server");
      expect(state.openTabs[1]?.type).toBe("desired");
      expect(state.activeTab).toBe("server");
    });

    it("opens a new closable tab and switches to it", () => {
      const tab = makeTab("roles");
      useStudioStore.getState().openTab(tab);
      const state = useStudioStore.getState();
      expect(state.openTabs).toHaveLength(3);
      expect(state.openTabs[2]?.id).toBe("roles");
      expect(state.activeTab).toBe("roles");
    });

    it("opening an already-open tab just switches to it", () => {
      useStudioStore.getState().switchTab("desired");
      expect(useStudioStore.getState().activeTab).toBe("desired");
      useStudioStore.getState().openTab(makeTab("desired"));
      const state = useStudioStore.getState();
      expect(state.openTabs).toHaveLength(2);
      expect(state.activeTab).toBe("desired");
    });

    it("channel tab id encodes the channel id", () => {
      const tab = makeTab("channel", { channelId: "abc123" });
      expect(tab.id).toBe("channel:abc123");
      expect(tab.closable).toBe(true);
      useStudioStore.getState().openTab(tab);
      expect(useStudioStore.getState().openTabs).toContainEqual(tab);
    });

    it("does not allow closing persistent tabs (server, desired)", () => {
      useStudioStore.getState().closeTab("server");
      const state = useStudioStore.getState();
      expect(state.openTabs.find((t) => t.id === "server")).toBeDefined();
      expect(state.activeTab).toBe("server");
    });

    it("closes closable tabs and falls back to neighbor", () => {
      useStudioStore.getState().openTab(makeTab("roles"));
      useStudioStore.getState().openTab(makeTab("members"));
      expect(useStudioStore.getState().activeTab).toBe("members");

      useStudioStore.getState().closeTab("members");
      const state = useStudioStore.getState();
      expect(state.openTabs.find((t) => t.id === "members")).toBeUndefined();
      expect(state.activeTab).toBe("roles");
    });

    it("closing the active tab with no next neighbor clears active", () => {
      useStudioStore.setState({
        openTabs: [makeTab("roles", { closable: true })],
        activeTab: "roles",
      });
      useStudioStore.getState().closeTab("roles");
      expect(useStudioStore.getState().activeTab).toBeNull();
    });

    it("switchTab is a no-op for unknown tab", () => {
      useStudioStore.getState().switchTab("does-not-exist");
      expect(useStudioStore.getState().activeTab).toBe("server");
    });
  });

  describe("conversation state", () => {
    it("setConversationId updates the id", () => {
      useStudioStore.getState().setConversationId("conv-1");
      expect(useStudioStore.getState().conversationId).toBe("conv-1");
    });

    it("setPhase updates the phase", () => {
      useStudioStore.getState().setPhase("planning");
      expect(useStudioStore.getState().phase).toBe("planning");
    });

    it("setPlanId and setError round-trip", () => {
      useStudioStore.getState().setPlanId("plan-1");
      useStudioStore.getState().setError("boom");
      expect(useStudioStore.getState().planId).toBe("plan-1");
      expect(useStudioStore.getState().error).toBe("boom");
    });

    it("resetConversation clears conversation, plan, phase, error, templates", () => {
      useStudioStore.getState().setConversationId("c");
      useStudioStore.getState().setPlanId("p");
      useStudioStore.getState().setPhase("executing");
      useStudioStore.getState().setError("err");
      useStudioStore.getState().addTemplate({ id: "t1", name: "T1" });

      useStudioStore.getState().resetConversation();

      const state = useStudioStore.getState();
      expect(state.conversationId).toBeNull();
      expect(state.planId).toBeNull();
      expect(state.phase).toBe("input");
      expect(state.error).toBe("");
      expect(state.activeTemplates).toEqual([]);
    });
  });

  describe("templates", () => {
    it("addTemplate is idempotent by id", () => {
      useStudioStore.getState().addTemplate({ id: "t1", name: "T1" });
      useStudioStore.getState().addTemplate({ id: "t1", name: "T1 dup" });
      expect(useStudioStore.getState().activeTemplates).toEqual([{ id: "t1", name: "T1" }]);
    });

    it("removeTemplate drops by id", () => {
      useStudioStore.getState().addTemplate({ id: "t1", name: "T1" });
      useStudioStore.getState().addTemplate({ id: "t2", name: "T2" });
      useStudioStore.getState().removeTemplate("t1");
      expect(useStudioStore.getState().activeTemplates).toEqual([{ id: "t2", name: "T2" }]);
    });
  });
});
