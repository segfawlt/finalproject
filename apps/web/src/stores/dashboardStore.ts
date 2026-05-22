import { create } from "zustand";

interface DashboardState {
  selectedGuild: string | null;
  activeTab: "history" | "rules" | "settings" | "stats";
  setSelectedGuild: (guildId: string | null) => void;
  setActiveTab: (tab: "history" | "rules" | "settings" | "stats") => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedGuild: null,
  activeTab: "history",
  setSelectedGuild: (guildId) => set({ selectedGuild: guildId }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
