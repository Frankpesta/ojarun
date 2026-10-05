import { View } from "react-native";
import { Check } from "phosphor-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

/** Selectable chip for presets and quick amounts. Selection shows a check, not colour alone. */
export function Chip({ label, selected, onPress, disabled }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      className={`flex-row items-center gap-1.5 rounded-full px-4 ${
        selected ? "bg-brand-tint" : "bg-surface"
      } ${disabled ? "opacity-40" : ""}`}
      style={{ minHeight: 40, borderWidth: 1.5, borderColor: selected ? colors.brand : colors.lineStrong }}
    >
      {selected ? (
        <View>
          <Check size={14} color={colors.brand} weight="bold" />
        </View>
      ) : null}
      <Text variant="smallStrong" tone="inherit" style={{ color: selected ? colors.brandPressed : colors.ink }} tabular>
        {label}
      </Text>
    </Pressable>
  );
}
