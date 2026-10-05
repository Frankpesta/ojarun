import type { ReactNode } from "react";
import { View } from "react-native";
import { CaretRight, type Icon as PhosphorIcon } from "phosphor-react-native";
import { sizes } from "@ojarun/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type ListItemProps = {
  title: string;
  subtitle?: string;
  icon?: PhosphorIcon;
  /** Right side: a value, pill or control. Defaults to a chevron when pressable. */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  accessibilityHint?: string;
};

export function ListItem({ title, subtitle, icon: Icon, trailing, onPress, destructive, accessibilityHint }: ListItemProps) {
  const { colors } = useTheme();
  const content = (
    <View className="flex-row items-center gap-3 py-3" style={{ minHeight: 56 }}>
      {Icon ? (
        <View className={`items-center justify-center rounded-full ${destructive ? "bg-error-tint" : "bg-surface-sunken"}`} style={{ width: 40, height: 40 }}>
          <Icon size={20} color={destructive ? colors.error : colors.ink} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text variant="bodyStrong" tone={destructive ? "error" : "ink"} numberOfLines={1} style={{ fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="faint" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <CaretRight size={18} color={colors.inkFaint} /> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      scale={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      style={{ minHeight: sizes.minTarget }}
    >
      {content}
    </Pressable>
  );
}
