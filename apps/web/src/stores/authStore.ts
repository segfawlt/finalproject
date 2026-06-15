import { create } from "zustand";
import { apiFetch } from "../lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  subscriptionTier: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: () => void;
  logout: () => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  login: () => {
    const base = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
    window.location.href = `${base}/api/auth/sign-in/social?provider=discord`;
  },
  logout: async () => {
    try {
      await apiFetch("/api/auth/sign-out", { method: "POST", skipAuthRedirect: true });
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },
  checkSession: async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await apiFetch("/api/me", { signal: controller.signal, skipAuthRedirect: true });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return;
        }
      }
    } catch {
      clearTimeout(timeout);
      // No session or timeout
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
