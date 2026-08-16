import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F9FAFB", // gray-50
        foreground: "#0F172A", // slate-900
        primary: "#0B1E36", // Dark navy from mockup
        accent: {
          DEFAULT: "#00C48C", // Vibrant green
          light: "#E5F9F4", // Light green background for badges
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F1F5F9", // slate-100
        }
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
