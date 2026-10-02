import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import type { TypeToken } from "@ojarun/ui";

export type Tone = "ink" | "muted" | "faint" | "brand" | "accent" | "error" | "onBrand" | "onAccent" | "inherit";

const VARIANT: Record<TypeToken, string> = {
  display: "text-display font-bold",
  title: "text-title font-semibold",
  heading: "text-heading font-semibold",
  body: "text-body font-regular",
  bodyStrong: "text-body font-semibold",
  small: "text-small font-regular",
  smallStrong: "text-small font-medium",
  caption: "text-caption font-medium",
};

const TONE: Record<Tone, string> = {
  ink: "text-ink",
  muted: "text-ink-muted",
  faint: "text-ink-faint",
  brand: "text-brand",
  accent: "text-accent-strong",
  error: "text-error",
  onBrand: "text-on-brand",
  onAccent: "text-on-accent",
  inherit: "",
};

export type TextProps = RNTextProps & {
  variant?: TypeToken;
  tone?: Tone;
  /** Tabular figures so amounts line up in lists and receipts (05 §7.2). */
  tabular?: boolean;
  className?: string;
};

export function Text({ variant = "body", tone = "ink", tabular, className = "", style, ...rest }: TextProps) {
  return (
    <RNText
      className={`${VARIANT[variant]} ${TONE[tone]} ${className}`}
      style={[tabular ? { fontVariant: ["tabular-nums"] } : null, style]}
      maxFontSizeMultiplier={1.6}
      {...rest}
    />
  );
}
