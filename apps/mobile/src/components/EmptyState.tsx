import type { ReactNode } from "react";
import { View } from "react-native";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/**
 * Left-aligned empty state. `art` takes one of the commissioned spot illustrations (05 §7.2);
 * until they land, a duotone icon on a tinted tile stands in.
 */
export function EmptyState({
  icon: Icon,
  art,
  title,
  body,
  action,
}: {
  icon?: PhosphorIcon;
  art?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-4 py-6">
      {art ??
        (Icon ? (
          <View className="items-center justify-center rounded-card bg-brand-tint" style={{ width: 64, height: 64 }}>
            <Icon size={32} color={colors.brand} weight="duotone" />
          </View>
        ) : null)}
      <View className="gap-1.5">
        <Text variant="heading">{title}</Text>
        {body ? (
          <Text variant="body" tone="muted">
            {body}
          </Text>
        ) : null}
      </View>
      {action ? <View className="pt-1">{action}</View> : null}
    </View>
  );
}
