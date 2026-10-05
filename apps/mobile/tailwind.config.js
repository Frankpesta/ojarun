/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset"), require("@ojarun/ui/tailwind")],
  darkMode: "class",
  theme: { extend: {} },
  plugins: [],
  // Weight comes from the font file (font-bold = PlusJakartaSans_700Bold). Adding fontWeight on top
  // makes Android look for a bold variant of that family, find none, and fall back to the system font.
  corePlugins: { fontWeight: false },
};
