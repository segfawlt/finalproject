import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
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
          "divider": "#3f4147",
          "channel-hover": "#35373c",
          "channel-active": "#404249",
        },
      },
      fontFamily: {
        sans: ["gg sans", "Noto Sans", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
