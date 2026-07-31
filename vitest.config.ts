import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    envDir: ".",
    include: ["packages/*/src/**/*.{test,spec}.{ts,js}", "apps/*/src/**/*.{test,spec}.{ts,js}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
