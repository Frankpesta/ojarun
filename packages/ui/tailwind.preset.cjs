/**
 * Shared Tailwind preset for apps/mobile (NativeWind) and apps/ops.
 * Colours resolve to CSS variables set per theme (see src/tokens.ts → themeVars),
 * so components write `bg-surface text-ink` and never `dark:` variants.
 */
const tokens = [
  "bg",
  "surface",
  "surface-raised",
  "surface-sunken",
  "ink",
  "ink-muted",
  "ink-faint",
  "line",
  "line-strong",
  "brand",
  "brand-pressed",
  "brand-tint",
  "on-brand",
  "accent",
  "accent-strong",
  "accent-tint",
  "on-accent",
  "warning",
  "on-warning",
  "error",
  "error-tint",
  "on-error",
  "info",
  "scrim",
];

const colors = Object.fromEntries(tokens.map((t) => [t, `rgb(var(--color-${t}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["PlusJakartaSans_400Regular"],
        regular: ["PlusJakartaSans_400Regular"],
        medium: ["PlusJakartaSans_500Medium"],
        semibold: ["PlusJakartaSans_600SemiBold"],
        bold: ["PlusJakartaSans_700Bold"],
      },
      fontSize: {
        display: ["32px", { lineHeight: "40px" }],
        title: ["22px", { lineHeight: "28px" }],
        heading: ["18px", { lineHeight: "24px" }],
        body: ["16px", { lineHeight: "24px" }],
        small: ["14px", { lineHeight: "20px" }],
        caption: ["12px", { lineHeight: "16px" }],
      },
      borderRadius: {
        chip: "10px",
        input: "12px",
        photo: "12px",
        button: "14px",
        card: "16px",
        sheet: "24px",
      },
      spacing: {
        gutter: "20px",
      },
    },
  },
};
