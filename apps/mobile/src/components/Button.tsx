import { ActivityIndicator, View } from "react-native";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { sizes } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "accent" | "ghost" | "danger";

const CONTAINER: Record<ButtonVariant, string> = {
  primary: "bg-brand",
  secondary: "bg-surface border border-line-strong",
  accent: "bg-accent",
  ghost: "bg-transparent",
  danger: "bg-error",
};

const LABEL_TONE = {
  primary: "onBrand",
  secondary: "ink",
  accent: "onAccent",
  ghost: "brand",
  danger: "onBrand",
} as const;

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** "lg" is the 56 dp shopper size (05 §7.4). */
  size?: "md" | "lg" | "sm";
  loading?: boolean;
  disabled?: boolean;
  icon?: PhosphorIcon;
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
  fullWidth = true,
  accessibilityHint,
  className = "",
}: ButtonProps) {
  const { colors } = useTheme();
  const height = size === "lg" ? sizes.shopperButtonHeight : size === "sm" ? 40 : sizes.buttonHeight;
  const inactive = disabled || loading;
  const tone = LABEL_TONE[variant];
  const fg =
    tone === "onBrand"
      ? colors.onBrand
      : tone === "onAccent"
        ? colors.onAccent
        : tone === "brand"
          ? colors.brand
          : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (variant === "primary" || variant === "accent") haptic.light();
        onPress?.();
      }}
      className={`${CONTAINER[variant]} ${fullWidth ? "self-stretch" : "self-start px-5"} rounded-button items-center justify-center ${
        inactive && !loading ? "opacity-40" : ""
      } ${className}`}
      style={{ height, minWidth: sizes.minTarget }}
    >
      <View className="flex-row items-center justify-center gap-2 px-4">
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {Icon ? <Icon size={20} color={fg} weight="bold" /> : null}
            <Text variant={size === "sm" ? "smallStrong" : "bodyStrong"} tone={tone} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}
