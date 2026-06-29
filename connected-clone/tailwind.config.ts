import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px",
      },
    },
    extend: {
      colors: {
        // Brand palette (approximated — connected.com.ua is bot-protected,
        // so exact hex values could not be sampled).
        brand: {
          DEFAULT: "#1FB6A6", // teal-green primary
          dark: "#0E8A7D",
          light: "#E6F7F4",
        },
        ink: {
          DEFAULT: "#0F172A", // near-black headings
          soft: "#475569",
        },
        accent: {
          blue: "#3B82F6",
          violet: "#8B5CF6",
          amber: "#F59E0B",
          rose: "#F43F5E",
        },
      },
      fontFamily: {
        sans: ["var(--font-work-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        marker: ["var(--font-marker)", "cursive"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
      },
      boxShadow: {
        card: "0 10px 40px -12px rgba(15, 23, 42, 0.12)",
        soft: "0 4px 24px -8px rgba(15, 23, 42, 0.10)",
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
      },
      animation: {
        marquee: "marquee 28s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
