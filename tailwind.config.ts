import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: "#F3EBDD",       // page background — warm beige
        surface: "#FFFFFF",
        ink: "#2B1D12",        // primary text — dark brown
        mute: "#8A7A6A",       // secondary text — muted warm gray
        gold: { DEFAULT: "#C89B3C", deep: "#A87F27", pale: "#F0E3C4" },
        terra: { DEFAULT: "#C0603E", deep: "#9E4A2D" },
        ok: "#2F7D4F",
        danger: "#8E2323"
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        arabic: ["'IBM Plex Sans Arabic'", "'Segoe UI'", "sans-serif"]
      },
      boxShadow: {
        card: "0 2px 6px rgba(43,29,18,.06), 0 12px 32px rgba(43,29,18,.08)"
      },
      borderRadius: { card: "1.25rem" }
    }
  },
  plugins: []
};
export default config;
