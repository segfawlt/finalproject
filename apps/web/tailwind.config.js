import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // App shell — Linear-inspired monochrome near-black
        // Used by Studio shell, chat, header, sidebar, tab bar
        shell: {
          canvas: "#000000",
          surface: "#0a0a0a",
          surface2: "#141414",
          surface3: "#1c1c1c",
          border: "#262626",
          "border-strong": "#3a3a3a",
          text: "#f5f5f5",
          "text-muted": "#a3a3a3",
          "text-subtle": "#737373",
          "text-link": "#d4d4d4",
          accent: "#f5f5f5",
          "accent-fg": "#000000",
          "accent-hover": "#d4d4d4",
          "accent-focus": "#a3a3a3",
        },
        // AI action palette — Cursor-inspired pastels
        // Only used in chat/agent UI (left borders on messages, tool call chips)
        agent: {
          thinking: "#dfa88f",
          reading: "#9fbbe0",
          editing: "#c0a8dd",
          asking: "#9fc9a2",
          done: "#c08532",
        },
        // Discord preview colors — kept for the right panel Discord clone
        discord: {
          bg: "#000000",
          "bg-secondary": "#0a0a0a",
          "bg-tertiary": "#141414",
          "bg-floating": "#050505",
          text: "#f5f5f5",
          "text-muted": "#a3a3a3",
          "text-link": "#d4d4d4",
          accent: "#f5f5f5",
          "accent-hover": "#d4d4d4",
          green: "#23a559",
          yellow: "#f0b232",
          red: "#f23f43",
          divider: "#262626",
          "channel-hover": "#141414",
          "channel-active": "#1c1c1c",
        },
        // Semantic colors — kept for functional indicators
        success: "#22c55e",
        warning: "#eab308",
        error: "#ef4444",
      },
      fontFamily: {
        sans: ["Geist", "sans-serif"],
        mono: [
          "Geist Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
