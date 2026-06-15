/**
 * Centralized fetch wrapper that prepends VITE_API_URL in production
 * builds and falls back to a same-origin relative path in dev. Also
 * handles 401 by clearing auth state and redirecting to /login.
 */

import { useAuthStore } from "../stores/authStore";

let apiBase = "";
const envBase = (import.meta.env.VITE_API_URL ?? "").trim();
if (envBase) {
  apiBase = envBase.replace(/\/+$/, "");
}

export function apiPath(path: string): string {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${apiBase}${path}`;
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip the global 401 handler (used by /me / checkSession). */
  skipAuthRedirect?: boolean;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { body, skipAuthRedirect, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(apiPath(path), {
    ...rest,
    credentials: "include",
    headers: finalHeaders,
    body:
      body !== undefined && !(body instanceof FormData)
        ? JSON.stringify(body)
        : (body as BodyInit | undefined),
  });

  if (res.status === 401 && !skipAuthRedirect) {
    useAuthStore.getState().logout();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return res;
}
