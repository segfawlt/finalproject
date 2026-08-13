import { create } from "zustand";

// ── Tab model ──────────────────────────────────────────────────────────────

export type TabType =
  | "server"
  | "desired"
  | "channel"
  | "roles"
  | "members"
  | "templates"
  | "drift";

export interface Tab {
  /** Stable unique key. Format: type or `type:payload` (e.g. "channel:123"). */
  id: string;
  type: TabType;
  channelId?: string;
  closable: boolean;
  title: string;
}

export function makeTab(
  type: TabType,
  opts: { channelId?: string; closable?: boolean; title?: string } = {}
): Tab {
  const id = type === "channel" && opts.channelId ? `channel:${opts.channelId}` : type;
  const closable = opts.closable ?? (type !== "server" && type !== "desired");
  const title = opts.title ?? defaultTitle(type, opts.channelId);
  return { id, type, channelId: opts.channelId, closable, title };
}

function defaultTitle(type: TabType, channelId?: string): string {
  switch (type) {
    case "server":
      return "Server";
    case "desired":
      return "Desired";
    case "channel":
      return channelId ? `#${channelId}` : "Channel";
    case "roles":
      return "Roles";
    case "members":
      return "Members";
    case "templates":
      return "Templates";
    case "drift":
      return "Drift";
  }
}

// ── Conversation phase ────────────────────────────────────────────────────

export type StudioPhase =
  | "input"
  | "planning"
  | "ask_user"
  | "completed"
  | "executing"
  | "executed"
  | "execute_failed";

// ── Templates in context ──────────────────────────────────────────────────

export interface ActiveTemplate {
  id: string;
  name: string;
}

// ── Store ──────────────────────────────────────────────────────────────────

const ACTIVE_GUILD_KEY = "active-guild-id";

function readActiveGuild(): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_GUILD_KEY);
}

function persistActiveGuild(guildId: string | null): void {
  if (typeof window === "undefined") return;
  if (guildId) window.localStorage.setItem(ACTIVE_GUILD_KEY, guildId);
  else window.localStorage.removeItem(ACTIVE_GUILD_KEY);
}

interface StudioState {
  // Guild
  selectedGuild: string | null;
  setSelectedGuild: (guildId: string | null) => void;

  // Selection
  selectedItems: string[];
  toggleSelectedItem: (itemId: string) => void;
  clearSelectedItems: () => void;

  // Drag
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;

  // Tabs (right panel)
  openTabs: Tab[];
  activeTab: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;

  // Conversation
  conversationId: string | null;
  planId: string | null;
  phase: StudioPhase;
  error: string;
  setConversationId: (id: string | null) => void;
  setPlanId: (id: string | null) => void;
  setPhase: (phase: StudioPhase) => void;
  setError: (error: string) => void;
  resetConversation: () => void;

  // Templates attached to the active conversation
  activeTemplates: ActiveTemplate[];
  addTemplate: (template: ActiveTemplate) => void;
  removeTemplate: (templateId: string) => void;

  // Drift (server changed externally). Per-guild so switching guilds
  // doesn't carry a stale flag.
  staleByGuild: Record<string, boolean>;
  markStale: (guildId: string, stale: boolean) => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  // Guild
  selectedGuild: readActiveGuild(),
  setSelectedGuild: (guildId) => {
    persistActiveGuild(guildId);
    set({ selectedGuild: guildId });
  },

  // Selection
  selectedItems: [],
  toggleSelectedItem: (itemId) =>
    set((state) => ({
      selectedItems: state.selectedItems.includes(itemId)
        ? state.selectedItems.filter((id) => id !== itemId)
        : [...state.selectedItems, itemId],
    })),
  clearSelectedItems: () => set({ selectedItems: [] }),

  // Drag
  isDragging: false,
  setIsDragging: (dragging) => set({ isDragging: dragging }),

  // Tabs
  openTabs: [makeTab("server"), makeTab("desired")],
  activeTab: "server",
  openTab: (tab) =>
    set((state) => {
      if (state.openTabs.some((t) => t.id === tab.id)) {
        return { activeTab: tab.id };
      }
      return { openTabs: [...state.openTabs, tab], activeTab: tab.id };
    }),
  closeTab: (id) =>
    set((state) => {
      const idx = state.openTabs.findIndex((t) => t.id === id);
      if (idx === -1) return state;
      const target = state.openTabs[idx];
      if (!target?.closable) return state;
      const nextTabs = state.openTabs.filter((t) => t.id !== id);
      let nextActive = state.activeTab;
      if (state.activeTab === id) {
        const fallback = nextTabs[idx] ?? nextTabs[idx - 1] ?? nextTabs[0];
        nextActive = fallback?.id ?? null;
      }
      return { openTabs: nextTabs, activeTab: nextActive };
    }),
  switchTab: (id) =>
    set((state) => (state.openTabs.some((t) => t.id === id) ? { activeTab: id } : state)),

  // Conversation
  conversationId: null,
  planId: null,
  phase: "input",
  error: "",
  setConversationId: (id) => set({ conversationId: id }),
  setPlanId: (id) => set({ planId: id }),
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  resetConversation: () =>
    set({
      conversationId: null,
      planId: null,
      phase: "input",
      error: "",
      activeTemplates: [],
    }),

  // Templates
  activeTemplates: [],
  addTemplate: (template) =>
    set((state) => ({
      activeTemplates: state.activeTemplates.some((t) => t.id === template.id)
        ? state.activeTemplates
        : [...state.activeTemplates, template],
    })),
  removeTemplate: (templateId) =>
    set((state) => ({
      activeTemplates: state.activeTemplates.filter((t) => t.id !== templateId),
    })),

  // Drift
  staleByGuild: {},
  markStale: (guildId, stale) =>
    set((state) => {
      if (!!state.staleByGuild[guildId] === stale) return state;
      return { staleByGuild: { ...state.staleByGuild, [guildId]: stale } };
    }),
}));
