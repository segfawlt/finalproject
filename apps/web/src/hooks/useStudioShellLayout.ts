import { create } from "zustand";

export const DEFAULT_LEFT_WIDTH = 260;
export const DEFAULT_RIGHT_WIDTH = 520;
export const STUDIO_SHELL_STORAGE_KEY = "studio-shell-layout-v1";

const LIMITS = {
  left: { min: 220, max: 420 },
  right: { min: 320, max: 720 },
} as const;

export interface StudioShellLayoutValues {
  leftWidth: number;
  rightWidth: number;
  leftVisible: boolean;
  rightVisible: boolean;
}

export interface StudioShellLayout extends StudioShellLayoutValues {
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  resetLeftWidth: () => void;
  resetRightWidth: () => void;
}

export function clampPanelWidth(side: "left" | "right", width: number): number {
  return Math.min(LIMITS[side].max, Math.max(LIMITS[side].min, width));
}

const DEFAULTS: StudioShellLayoutValues = {
  leftWidth: DEFAULT_LEFT_WIDTH,
  rightWidth: DEFAULT_RIGHT_WIDTH,
  leftVisible: true,
  rightVisible: true,
};

function isLayoutValues(value: unknown): value is StudioShellLayoutValues {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.leftWidth === "number" &&
    clampPanelWidth("left", candidate.leftWidth) === candidate.leftWidth &&
    typeof candidate.rightWidth === "number" &&
    clampPanelWidth("right", candidate.rightWidth) === candidate.rightWidth &&
    typeof candidate.leftVisible === "boolean" &&
    typeof candidate.rightVisible === "boolean"
  );
}

export function readStudioShellLayout(): StudioShellLayoutValues {
  if (typeof window === "undefined") return DEFAULTS;

  try {
    const raw = window.localStorage.getItem(STUDIO_SHELL_STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    return isLayoutValues(parsed) ? parsed : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function persistLayout(values: StudioShellLayoutValues): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STUDIO_SHELL_STORAGE_KEY, JSON.stringify(values));
  }
}

export const useStudioShellLayout = create<StudioShellLayout>((set) => ({
  ...readStudioShellLayout(),
  setLeftWidth: (width) =>
    set((state) => {
      const next = { ...state, leftWidth: clampPanelWidth("left", width) };
      persistLayout(next);
      return next;
    }),
  setRightWidth: (width) =>
    set((state) => {
      const next = { ...state, rightWidth: clampPanelWidth("right", width) };
      persistLayout(next);
      return next;
    }),
  toggleLeft: () =>
    set((state) => {
      const next = { ...state, leftVisible: !state.leftVisible };
      persistLayout(next);
      return next;
    }),
  toggleRight: () =>
    set((state) => {
      const next = { ...state, rightVisible: !state.rightVisible };
      persistLayout(next);
      return next;
    }),
  resetLeftWidth: () =>
    set((state) => {
      const next = { ...state, leftWidth: DEFAULT_LEFT_WIDTH };
      persistLayout(next);
      return next;
    }),
  resetRightWidth: () =>
    set((state) => {
      const next = { ...state, rightWidth: DEFAULT_RIGHT_WIDTH };
      persistLayout(next);
      return next;
    }),
}));
