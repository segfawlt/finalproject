import { create } from "zustand";

interface PanelState {
  leftPanel: "summary" | "reasoning";
  rightPanel: "preview" | "diff";
  showProgress: boolean;
}

interface StudioState {
  selectedGuild: string | null;
  selectedItems: string[];
  panelState: PanelState;
  isDragging: boolean;
  setSelectedGuild: (guildId: string | null) => void;
  toggleSelectedItem: (itemId: string) => void;
  clearSelectedItems: () => void;
  setLeftPanel: (panel: "summary" | "reasoning") => void;
  setRightPanel: (panel: "preview" | "diff") => void;
  toggleProgress: () => void;
  setIsDragging: (dragging: boolean) => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  selectedGuild: null,
  selectedItems: [],
  panelState: {
    leftPanel: "summary",
    rightPanel: "preview",
    showProgress: false,
  },
  isDragging: false,
  setSelectedGuild: (guildId) => set({ selectedGuild: guildId }),
  toggleSelectedItem: (itemId) =>
    set((state) => ({
      selectedItems: state.selectedItems.includes(itemId)
        ? state.selectedItems.filter((id) => id !== itemId)
        : [...state.selectedItems, itemId],
    })),
  clearSelectedItems: () => set({ selectedItems: [] }),
  setLeftPanel: (panel) =>
    set((state) => ({ panelState: { ...state.panelState, leftPanel: panel } })),
  setRightPanel: (panel) =>
    set((state) => ({ panelState: { ...state.panelState, rightPanel: panel } })),
  toggleProgress: () =>
    set((state) => ({
      panelState: { ...state.panelState, showProgress: !state.panelState.showProgress },
    })),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
}));
