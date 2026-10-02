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
      className={`flex-row items-center gap-1.5 rounded-chip px-3.5 ${
        selected ? "bg-brand-tint" : "bg-surface"
      } ${disabled ? "opacity-40" : ""}`}
      style={{ minHeight: 40, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.brand : colors.lineStrong }}
    >
      {selected ? (
        <View>
          <Check size={14} color={colors.brand} weight="bold" />
        </View>
      ) : null}
      <Text variant="smallStrong" tone={selected ? "brand" : "ink"} tabular>
        {label}
      </Text>
    </Pressable>
  );
}
