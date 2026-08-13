import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    envDir: ".",
    include: [
      "packages/*/src/**/*.{test,spec}.{ts,tsx,js}",
      "apps/*/src/**/*.{test,spec}.{ts,tsx,js}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["apps/web/src/test/setup.ts"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
  },
});
