/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("@ojarun/ui/tailwind")],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        regular: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        medium: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        semibold: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        bold: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
