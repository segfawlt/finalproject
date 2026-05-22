import { create } from "zustand";

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
    window.location.href = "/api/auth/signin/discord";
  },
  logout: async () => {
    await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    set({ user: null, isAuthenticated: false });
  },
  checkSession: async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          set({ user: data.user, isAuthenticated: true, isLoading: false });
          return;
        }
      }
    } catch {
      // No session
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
