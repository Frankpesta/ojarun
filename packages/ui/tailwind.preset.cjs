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
  "placeholder",
  "line",
  "line-soft",
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
  "warning-tint",
  "warning-ink",
  "forest",
  "on-forest",
  "forest-muted",
  "on-forest-soft",
  "forest-active",
  "live",
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
        extrabold: ["PlusJakartaSans_800ExtraBold"],
      },
      fontSize: {
        display: ["34px", { lineHeight: "40px", letterSpacing: "-1px" }],
        title: ["30px", { lineHeight: "36px", letterSpacing: "-0.8px" }],
        heading: ["19px", { lineHeight: "24px", letterSpacing: "-0.3px" }],
        body: ["16px", { lineHeight: "24px" }],
        small: ["14px", { lineHeight: "20px" }],
        caption: ["12px", { lineHeight: "16px" }],
      },
      borderRadius: {
        chip: "10px",
        input: "14px",
        photo: "12px",
        button: "16px",
        card: "20px",
        hero: "24px",
        sheet: "28px",
      },
      spacing: {
        gutter: "20px",
      },
    },
  },
};
