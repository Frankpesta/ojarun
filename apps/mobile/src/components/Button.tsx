import { ActivityIndicator, View } from "react-native";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { sizes, type Theme } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

/**
 * primary: the one main action. secondary: outlined alternative. soft: low-emphasis green
 * (Reorder, Edit). onForest: white button on a forest card. glass: translucent button on a
 * forest card. ghost: text-only. danger/accent: as named.
 */
export type ButtonVariant = "primary" | "secondary" | "soft" | "onForest" | "glass" | "accent" | "ghost" | "danger";

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-brand",
  secondary: "bg-surface border-[1.5px] border-line-strong",
  soft: "bg-brand-tint",
  onForest: "bg-on-forest",
  glass: "bg-on-forest/10",
  accent: "bg-accent",
  ghost: "bg-transparent",
  danger: "bg-error",
};

const LABEL: Record<ButtonVariant, keyof Theme> = {
  primary: "onBrand",
  secondary: "ink",
  soft: "brandPressed",
  onForest: "forest",
  glass: "onForest",
  accent: "onAccent",
  ghost: "brand",
  danger: "onError",
};

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** md 56 (default), lg 56 shopper size, sm 40 for inline actions. */
  size?: "md" | "lg" | "sm";
  loading?: boolean;
  disabled?: boolean;
  icon?: PhosphorIcon;
  /** Icon after the label, e.g. a caret on "Continue". */
  trailingIcon?: PhosphorIcon;
  fullWidth?: boolean;
  accessibilityHint?: string;
  className?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon: Icon,
  trailingIcon: TrailingIcon,
  fullWidth = true,
  accessibilityHint,
  className = "",
}: ButtonProps) {
  const { colors } = useTheme();
  const height = size === "lg" ? sizes.shopperButtonHeight : size === "sm" ? 40 : sizes.buttonHeight;
  const inactive = disabled || loading;
  const fg = colors[LABEL[variant]];
  const small = size === "sm";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (variant === "primary" || variant === "accent" || variant === "onForest") haptic.light();
        onPress?.();
      }}
      className={`${CONTAINER[variant]} ${fullWidth ? "self-stretch" : small ? "self-start px-3" : "self-start px-5"} ${
        small ? "rounded-xl" : "rounded-button"
      } items-center justify-center ${inactive && !loading ? "opacity-40" : ""} ${className}`}
      style={{ height, minWidth: sizes.minTarget }}
    >
      <View className="flex-row items-center justify-center gap-2 px-4">
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {Icon ? <Icon size={small ? 16 : 20} color={fg} weight="bold" /> : null}
            <Text
              variant={small ? "smallStrong" : "bodyStrong"}
              tone="inherit"
              style={{ color: fg, fontSize: small ? 14 : 17 }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {TrailingIcon ? <TrailingIcon size={small ? 14 : 18} color={fg} weight="bold" /> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}
