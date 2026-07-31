import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // App shell — Linear-inspired monochrome near-black
        // Used by Studio shell, chat, header, sidebar, tab bar
        shell: {
          canvas: "#0a0a0b",
          surface: "#131316",
          surface2: "#1a1a1e",
          surface3: "#222226",
          border: "#26262a",
          "border-strong": "#34343a",
          text: "#ededee",
          "text-muted": "#a0a0a8",
          "text-subtle": "#6e6e76",
          "text-link": "#7aa2f7",
          accent: "#ededee",
          "accent-fg": "#0a0a0b",
          "accent-hover": "#d4d4d8",
          "accent-focus": "#a1a1aa",
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
          bg: "#313338",
          "bg-secondary": "#2b2d31",
          "bg-tertiary": "#1e1f22",
          "bg-floating": "#111214",
          text: "#dcddde",
          "text-muted": "#949ba4",
          "text-link": "#00a8fc",
          accent: "#5865f2",
          "accent-hover": "#4752c4",
          green: "#23a559",
          yellow: "#f0b232",
          red: "#f23f43",
          divider: "#3f4147",
          "channel-hover": "#35373c",
          "channel-active": "#404249",
        },
        // Semantic colors — kept for functional indicators
        success: "#22c55e",
        warning: "#eab308",
        error: "#ef4444",
      },
      fontFamily: {
        sans: [
          "Inter",
          "gg sans",
          "Noto Sans",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
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
