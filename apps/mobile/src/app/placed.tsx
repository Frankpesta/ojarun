import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import Animated, { FadeInDown, ZoomIn, useReducedMotion } from "react-native-reanimated";
import { Check } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosDay, formatLagosWindow, formatNaira } from "@ojarun/shared";
import { Button, Sticker, Text } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function PlacedScreen() {
  return (
    <RoleGuard role="customer">
      <Placed />
    </RoleGuard>
  );
}

function Placed() {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useQuery(api.orders.get, id ? { orderId: id as Id<"orders"> } : "skip");

  useEffect(() => {
    if (order) haptic.success();
  }, [!!order]);

  const day = order?.window ? formatLagosDay(order.window.date, Date.now()) : "";
  const when = order?.window ? `${day}, ${formatLagosWindow(order.window.start, order.window.end)}` : "";

  return (
    <SafeAreaView edges={["top", "bottom"]} className="flex-1 bg-bg px-6 pb-4">
      <View className="flex-1 items-center justify-center gap-6">
        {/* Animation sits on a wrapper with style only; className stays on plain views. */}
        <Animated.View entering={reduce ? undefined : ZoomIn.springify().damping(14)}>
          <View className="items-center justify-center" style={{ width: 180, height: 180 }}>
            <View className="absolute inset-0 rounded-full bg-brand-tint" />
            <View className="absolute rounded-full" style={{ inset: 22, backgroundColor: colors.brand, opacity: 0.16 }} />
            <View
              className="items-center justify-center rounded-full bg-brand"
              style={{ width: 92, height: 92, shadowColor: colors.brand, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}
            >
              <Check size={46} color={colors.onBrand} weight="bold" />
            </View>
            <View className="absolute" style={{ left: -26, top: 18, transform: [{ rotate: "-14deg" }] }}>
              <Sticker kind="tomato" size={52} />
            </View>
            <View className="absolute" style={{ right: -30, top: 40, transform: [{ rotate: "12deg" }] }}>
              <Sticker kind="plantain" size={56} />
            </View>
            <View className="absolute" style={{ left: 4, bottom: -14, transform: [{ rotate: "10deg" }] }}>
              <Sticker kind="fish" size={48} />
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={reduce ? undefined : FadeInDown.delay(150).duration(320)}>
          <View className="items-center gap-2.5">
            <Text variant="title" className="text-center" accessibilityRole="header">
              Order placed!
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              {order
                ? `Your shopper heads to ${order.marketName} ${day.toLowerCase()}. We'll tell you when they start, and ask before spending more on anything.`
                : " "}
            </Text>
          </View>
        </Animated.View>

        {order ? (
          <View className="w-full rounded-card border border-line bg-surface px-4">
            <Row label="Arriving" value={when} />
            <Row label="Items" value={`${order.items.length} from ${order.marketName}`} />
            <Row label="Paid" value={formatNaira(order.totals.chargeAmount + order.totals.walletApplied)} last />
          </View>
        ) : null}
      </View>

      <View className="gap-1">
        <Button label="Track my order" onPress={() => router.replace({ pathname: "/order/[id]", params: { id: id! } })} disabled={!order} />
        <Button label="Back to home" variant="ghost" onPress={() => router.replace("/home")} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View className={`flex-row justify-between gap-3 py-3 ${last ? "" : "border-b border-line-soft"}`}>
      <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" tabular style={{ fontSize: 15 }} className="flex-shrink text-right">
        {value}
      </Text>
    </View>
  );
}
