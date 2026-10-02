import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { cssVarName, darkTheme, hexToRgbTriplet, lightTheme, type Theme } from "./tokens";

/** Pairs that must pass WCAG AA in both themes. [foreground, background, minimum] */
const REQUIRED: [keyof Theme, keyof Theme, number][] = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "surfaceRaised", 4.5],
  ["inkMuted", "bg", 4.5],
  ["inkMuted", "surface", 4.5],
  ["inkMuted", "surfaceRaised", 4.5],
  ["inkFaint", "surface", 3],
  ["brand", "bg", 4.5],
  ["brand", "surface", 4.5],
  ["onBrand", "brand", 4.5],
  ["onBrand", "brandPressed", 4.5],
  ["onAccent", "accent", 4.5],
  ["accentStrong", "surface", 4.5],
  ["onWarning", "warning", 4.5],
  ["onError", "error", 4.5],
  ["error", "surface", 4.5],
  ["info", "surface", 4.5],
  ["ink", "brandTint", 4.5],
  ["ink", "accentTint", 4.5],
  ["ink", "errorTint", 4.5],
  ["lineStrong", "surface", 1.3],
];

describe.each([
  ["light", lightTheme],
  ["dark", darkTheme],
])("%s theme contrast", (_name, theme) => {
  it.each(REQUIRED)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("token helpers", () => {
  it("converts hex to an RGB triplet", () => {
    expect(hexToRgbTriplet("#15803D")).toBe("21 128 61");
  });
  it("names CSS variables in kebab case", () => {
    expect(cssVarName("surfaceRaised")).toBe("--color-surface-raised");
  });
});
