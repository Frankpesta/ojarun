import { View } from "react-native";
import { ITEM_STATUS_LABEL, type ItemStatus } from "@ojarun/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

export type PillTone = "brand" | "warning" | "muted" | "error" | "accent" | "info";

/** Item status colours from doc 03 §2: bought green, adjusted palm, skipped grey, rejected red. */
export const ITEM_TONE: Record<ItemStatus, PillTone> = {
  pending: "muted",
  bought: "brand",
  adjusted: "warning",
  skipped: "muted",
  rejected: "error",
};

/** Always text + colour, never colour alone (05 §7.6). */
export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const { colors } = useTheme();
  const map: Record<PillTone, { bg: string; fg: string; dot: string }> = {
    brand: { bg: colors.brandTint, fg: colors.ink, dot: colors.brand },
    warning: { bg: colors.warning, fg: colors.onWarning, dot: colors.onWarning },
    muted: { bg: colors.surfaceSunken, fg: colors.inkMuted, dot: colors.inkFaint },
    error: { bg: colors.errorTint, fg: colors.ink, dot: colors.error },
    accent: { bg: colors.accentTint, fg: colors.ink, dot: colors.accent },
    info: { bg: colors.surfaceSunken, fg: colors.ink, dot: colors.info },
  };
  const c = map[tone];
  return (
    <View className="flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1" style={{ backgroundColor: c.bg }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} />
      <Text variant="caption" style={{ color: c.fg }}>
        {label}
      </Text>
    </View>
  );
}

export function ItemStatusPill({ status }: { status: ItemStatus }) {
  return <StatusPill label={ITEM_STATUS_LABEL[status]} tone={ITEM_TONE[status]} />;
}
