import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import {
  formatLagosClock,
  formatLagosDay,
  formatLagosWindow,
  formatNaira,
  lagosDate,
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@ojarun/shared";
import { fontFamily } from "@ojarun/ui";
import { BackButton, ItemStatusPill, Skeleton, Sticker, Text, stickerFor } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { FallbackTile } from "@/features/list/ItemSheet";
import { useTheme } from "@/theme/ThemeProvider";

type Order = NonNullable<FunctionReturnType<typeof api.orders.get>>;

export default function OrderScreen() {
  return (
    <RoleGuard role="customer">
      <OrderDetail />
    </RoleGuard>
  );
}

const STEPS = ["Paid", "Shopping", "On the way", "At your door"] as const;

/** How far along the four-step bar each status is: whole steps done, plus a half for "in progress". */
const PROGRESS: Record<OrderStatus, number> = {
  pending_payment: 0,
  paid: 1,
  assigned: 1,
  shopping: 1.5,
  en_route: 2.5,
  arrived: 3.5,
  completed: 4,
  cancelled: 0,
  expired: 0,
};

function headline(o: Order): { title: string; sub: string } {
  const when = o.window ? `${formatLagosDay(o.window.date, Date.now())}, ${formatLagosWindow(o.window.start, o.window.end)}` : "";
  switch (o.status) {
    case "pending_payment":
      return { title: "Waiting for payment", sub: `Finish paying by ${formatLagosClock(o.holdExpiresAt)} to keep your delivery time.` };
    case "paid":
      return { title: "Order confirmed", sub: `We're lining up your shopper for ${o.marketName}. Arriving ${when.toLowerCase()}.` };
    case "assigned":
      return { title: "Shopper assigned", sub: `Shopping starts soon at ${o.marketName}. Arriving ${when.toLowerCase()}.` };
    case "shopping":
      return { title: `Shopping at ${o.marketName}`, sub: `Arriving ${when.toLowerCase()}` };
    case "en_route":
      return { title: "On the way", sub: `Arriving ${when.toLowerCase()}` };
    case "arrived":
      return { title: "At your door", sub: "Check each item, then accept the delivery." };
    case "completed":
      return { title: "Delivered", sub: "Change and refunds are in your wallet." };
    case "cancelled":
      return { title: "Cancelled", sub: "Any refund went to your wallet." };
    case "expired":
      return { title: "Payment not completed", sub: "This order was never charged. Your list is still saved." };
  }
}

function OrderDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useQuery(api.orders.get, id ? { orderId: id as Id<"orders"> } : "skip");

  if (order === undefined) {
    return (
      <SafeAreaView className="flex-1 bg-bg px-gutter gap-4">
        <BackButton />
        <Skeleton height={200} />
        <Skeleton height={300} />
      </SafeAreaView>
    );
  }
  if (order === null) {
    return (
      <SafeAreaView className="flex-1 bg-bg px-gutter gap-3">
        <BackButton />
        <Text variant="heading">Order not found</Text>
        <Text variant="body" tone="muted">
          It may belong to another account.
        </Text>
      </SafeAreaView>
    );
  }

  const { title, sub } = headline(order);
  const progress = PROGRESS[order.status];
  const ended = order.status === "cancelled" || order.status === "expired";
  const bought = order.items.filter((i) => i.status === "bought" || i.status === "adjusted").length;
  const t = order.totals;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="bg-forest" style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <SafeAreaView edges={["top"]} className="gap-[18px] px-gutter pb-6 pt-2">
            <View className="flex-row items-center justify-between">
              <BackButton tone="onForest" />
              <Text variant="smallStrong" tone="forestMuted">
                Order {order.code}
              </Text>
              <View style={{ width: 44 }} />
            </View>
            <View className="gap-1.5">
              <Text variant="title" tone="onForest" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
                {title}
              </Text>
              <Text variant="body" tone="onForestSoft" style={{ fontSize: 15 }}>
                {sub}
              </Text>
            </View>
            {ended ? null : (
              <View className="flex-row gap-1.5" accessible accessibilityLabel={`Progress: ${ORDER_STATUS_LABEL[order.status]}`}>
                {STEPS.map((label, i) => {
                  const fill = Math.max(0, Math.min(1, progress - i));
                  const current = fill > 0 && fill < 1;
                  return (
                    <View key={label} className="flex-1 gap-2">
                      <View className="h-1.5 overflow-hidden rounded-full bg-on-forest/15">
                        <View className="h-full rounded-full bg-live" style={{ width: `${fill * 100}%` }} />
                      </View>
                      <Text
                        variant="caption"
                        tone={current ? "live" : fill === 1 ? "onForest" : "forestMuted"}
                        style={current ? { fontFamily: fontFamily.extrabold } : undefined}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </SafeAreaView>
        </View>

        <View className="gap-5 px-gutter pt-5">
          <View className="gap-3">
            <View className="flex-row items-baseline justify-between">
              <Text variant="heading" accessibilityRole="header">
                Your items
              </Text>
              <Text variant="smallStrong" tone="brand">
                {bought ? `${bought} of ${order.items.length} bought` : `${order.items.length} ${order.items.length === 1 ? "item" : "items"}`}
              </Text>
            </View>
            <View className="overflow-hidden rounded-card border border-line bg-surface">
              {order.items.map((item, i) => {
                const kind = stickerFor(item.name);
                const details = [...item.preferences, item.note].filter(Boolean).join(" · ");
                return (
                  <View
                    key={item._id}
                    className={`flex-row items-center gap-3 px-3.5 py-3 ${i < order.items.length - 1 ? "border-b border-line-soft" : ""}`}
                    accessible
                    accessibilityLabel={`${item.name}, budget ${formatNaira(item.budget)}, ${item.status}`}
                  >
                    {kind ? <Sticker kind={kind} size={52} /> : <FallbackTile size={52} />}
                    <View className="flex-1 gap-0.5">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="small" tone="faint" numberOfLines={1}>
                        {item.amountSpent > 0
                          ? `${formatNaira(item.amountSpent)} of ${formatNaira(item.budget)}`
                          : `Budget ${formatNaira(item.budget)}${details ? ` · ${details}` : ""}`}
                      </Text>
                    </View>
                    {ended ? null : <ItemStatusPill status={item.status} />}
                  </View>
                );
              })}
            </View>
          </View>

          <View className="gap-3 rounded-card border border-line bg-surface p-4">
            <Text variant="bodyStrong" accessibilityRole="header">
              Payment
            </Text>
            <Line label="Item budgets" value={formatNaira(t.budgets)} />
            {t.buffer > 0 ? <Line label={`Buffer (${order.bufferPct}%)`} value={formatNaira(t.buffer)} /> : null}
            <Line label="Service fee" value={formatNaira(t.serviceFee)} />
            <Line label="Delivery" value={formatNaira(t.deliveryFee)} />
            {t.paystackCharge > 0 ? <Line label="Paystack charge" value={formatNaira(t.paystackCharge)} /> : null}
            {t.walletApplied > 0 ? <Line label="From your wallet" value={`−${formatNaira(t.walletApplied)}`} /> : null}
            <View className="h-px bg-line-soft" />
            <View className="flex-row items-baseline justify-between">
              <Text variant="bodyStrong">{order.status === "pending_payment" ? "To pay" : "Paid by card or transfer"}</Text>
              <Text variant="bodyStrong" tabular>
                {formatNaira(t.chargeAmount)}
              </Text>
            </View>
          </View>

          <View className="gap-3">
            <Text variant="heading" accessibilityRole="header">
              Timeline
            </Text>
            <View className="gap-0 rounded-card border border-line bg-surface px-4 py-2">
              {order.timeline.map((e, i) => (
                <View key={`${e.status}-${e.at}`} className="flex-row gap-3 py-2.5">
                  <View className="items-center" style={{ width: 12 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: i === order.timeline.length - 1 ? colors.brand : colors.lineStrong }} />
                    {i < order.timeline.length - 1 ? <View className="flex-1 bg-line" style={{ width: 2, marginTop: 4, marginBottom: -14 }} /> : null}
                  </View>
                  <View className="flex-1">
                    <Text variant="smallStrong">{ORDER_STATUS_LABEL[e.status as OrderStatus] ?? e.status}</Text>
                    <Text variant="caption" tone="faint">
                      {formatLagosDay(lagosDate(e.at), Date.now())}, {formatLagosClock(e.at)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
        {label}
      </Text>
      <Text variant="body" tabular style={{ fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}
