/**
 * OjaRun design tokens (docs/03-brand-guidelines.md, docs/05-build-plan.md §7).
 * Components consume semantic names only; light/dark swap underneath via CSS variables.
 */

export const palette = {
  green50: "#ECFDF3",
  green600: "#15803D",
  green700: "#166534",
  green900: "#14532D",
  greenDark: "#4ADE80",
  pepper500: "#E4572E",
  pepper700: "#C2410C",
  pepperDark: "#FF7A50",
  palm500: "#F4B400",
  ink: "#1C1917",
  inkMuted: "#57534E",
  nearBlack: "#1A1A1A",
  white: "#FFFFFF",
} as const;

export type ColorToken =
  | "bg"
  | "surface"
  | "surfaceRaised"
  | "surfaceSunken"
  | "ink"
  | "inkMuted"
  | "inkFaint"
  | "line"
  | "lineStrong"
  | "brand"
  | "brandPressed"
  | "brandTint"
  | "onBrand"
  | "accent"
  | "accentStrong"
  | "accentTint"
  | "onAccent"
  | "warning"
  | "onWarning"
  | "warningTint"
  | "warningInk"
  | "forest"
  | "onForest"
  | "forestMuted"
  | "forestActive"
  | "live"
  | "error"
  | "errorTint"
  | "onError"
  | "info"
  | "scrim";

export type Theme = Record<ColorToken, string>;

export const lightTheme: Theme = {
  bg: "#F8F5EE",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceSunken: "#F3EFE7",
  ink: "#1A1714",
  inkMuted: "#5C554D",
  inkFaint: "#6B645C",
  line: "#ECE6DA",
  lineStrong: "#DDD6CA",
  brand: palette.green600,
  brandPressed: "#0E5A2B",
  brandTint: "#E3F2E7",
  onBrand: palette.white,
  accent: palette.pepper500,
  accentStrong: "#B8401A",
  accentTint: "#FDEEE8",
  onAccent: palette.nearBlack,
  warning: palette.palm500,
  onWarning: palette.nearBlack,
  warningTint: "#FFF1C7",
  warningInk: "#6B4E00",
  error: "#B42318",
  errorTint: "#FDECEA",
  onError: palette.white,
  info: "#2563EB",
  scrim: "#0C1A12",
  /** Deep green for hero cards, the live order card and the floating tab bar. */
  forest: "#0B3B22",
  onForest: palette.white,
  forestMuted: "#A7D7B5",
  /** Active tab highlight on the floating bar. */
  forestActive: "#DCF7E4",
  /** Bright "live" green: progress fills and status dots on forest. */
  live: palette.greenDark,
};

export const darkTheme: Theme = {
  bg: "#0C1A12",
  surface: "#13241A",
  surfaceRaised: "#1A2E22",
  surfaceSunken: "#09140E",
  ink: "#E8F5EC",
  inkMuted: "#A8B5AD",
  inkFaint: "#8E9C94",
  line: "#24392C",
  lineStrong: "#335040",
  brand: palette.greenDark,
  brandPressed: "#22C55E",
  brandTint: "#16301F",
  onBrand: "#0C1A12",
  accent: palette.pepperDark,
  accentStrong: palette.pepperDark,
  accentTint: "#33201A",
  onAccent: "#0C1A12",
  warning: palette.palm500,
  onWarning: palette.nearBlack,
  warningTint: "#3A2F0E",
  warningInk: "#F6C94A",
  error: "#F97066",
  errorTint: "#3A1A18",
  onError: "#0C1A12",
  info: "#60A5FA",
  scrim: "#000000",
  forest: "#173B27",
  onForest: "#E8F5EC",
  forestMuted: "#A8C9B3",
  forestActive: "#4ADE80",
  live: palette.greenDark,
};

export const themes = { light: lightTheme, dark: darkTheme } as const;
export type ThemeName = keyof typeof themes;

/** Scrim opacity behind sheets (05 §7.1). */
export const scrimOpacity: Record<ThemeName, number> = { light: 0.4, dark: 0.6 };

/** 4-pt spacing scale. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const gutter = 20;

/** The only allowed radii. */
export const radius = { chip: 10, input: 14, photo: 12, button: 16, card: 20, hero: 24, sheet: 28, full: 9999 } as const;

export const fontFamily = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export type TypeToken = "display" | "title" | "heading" | "body" | "bodyStrong" | "small" | "smallStrong" | "caption";

export const typeScale: Record<TypeToken, { size: number; lineHeight: number; family: keyof typeof fontFamily }> = {
  display: { size: 34, lineHeight: 40, family: "extrabold" },
  title: { size: 30, lineHeight: 36, family: "extrabold" },
  heading: { size: 19, lineHeight: 24, family: "extrabold" },
  body: { size: 16, lineHeight: 24, family: "regular" },
  bodyStrong: { size: 16, lineHeight: 22, family: "bold" },
  small: { size: 14, lineHeight: 20, family: "regular" },
  smallStrong: { size: 14, lineHeight: 20, family: "bold" },
  caption: { size: 12, lineHeight: 16, family: "semibold" },
};

/** Motion (05 §7.1, §7.4). */
export const motion = {
  sheetSpring: { damping: 22, stiffness: 220, mass: 1 },
  reducedSheetMs: 180,
  scrimMs: 200,
  pressMs: 100,
  pressScale: 0.98,
  skeletonDelayMs: 150,
  holdToConfirmMs: 700,
  toastMs: 4000,
} as const;

export const sizes = {
  buttonHeight: 56,
  shopperButtonHeight: 56,
  minTarget: 44,
  grabberWidth: 36,
  grabberHeight: 4,
} as const;

/** "#15803D" → "21 128 61" for rgb(var(--x) / <alpha-value>) usage. */
export function hexToRgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** kebab-case CSS variable name for a token: surfaceRaised → --color-surface-raised */
export function cssVarName(token: ColorToken): string {
  return `--color-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** CSS variable map for a theme, values as RGB triplets. */
export function themeVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme)) out[cssVarName(k as ColorToken)] = hexToRgbTriplet(v);
  return out;
}
