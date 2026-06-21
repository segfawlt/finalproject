import { createAuthClient } from "better-auth/react";

const baseURL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const authClient = createAuthClient({
  baseURL: baseURL || undefined,
});
