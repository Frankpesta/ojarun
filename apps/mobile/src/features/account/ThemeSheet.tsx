import { View } from "react-native";
import { Check, CircleHalf, Moon, Sun, type Icon } from "phosphor-react-native";
import { Pressable, Sheet, Text, type SheetController } from "@/components";
import { useTheme, useThemePreference, type ThemePreference } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: Icon }[] = [
  { value: "system", label: "Match my phone", hint: "Switches with your phone's setting", icon: CircleHalf },
  { value: "light", label: "Light", hint: "Warm, bright background", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easier on the eyes at night", icon: Moon },
];

export const THEME_LABEL: Record<ThemePreference, string> = {
  system: "Match my phone",
  light: "Light",
  dark: "Dark",
};

export function ThemeSheet({ sheet }: { sheet: SheetController }) {
  const { colors } = useTheme();
  const { preference, setPreference } = useThemePreference();

  return (
    <Sheet sheet={sheet} title="Appearance">
      <View accessibilityRole="radiogroup" className="gap-1">
        {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
          const selected = preference === value;
          return (
            <Pressable
              key={value}
              scale={false}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              accessibilityHint={hint}
              onPress={() => {
                haptic.select();
                setPreference(value);
              }}
              className={`flex-row items-center gap-3 rounded-card px-3 py-3 ${selected ? "bg-brand-tint" : ""}`}
              style={{ minHeight: 60 }}
            >
              <Icon size={22} color={selected ? colors.brand : colors.inkMuted} weight={selected ? "fill" : "regular"} />
              <View className="flex-1">
                <Text variant="bodyStrong">{label}</Text>
                <Text variant="small" tone="muted">
                  {hint}
                </Text>
              </View>
              {selected ? (
                <Check size={20} color={colors.brand} weight="bold" />
              ) : (
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.lineStrong }} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
