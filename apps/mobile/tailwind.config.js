/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@ojarun/ui/tailwind")],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
};
