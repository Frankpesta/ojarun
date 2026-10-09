import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosDay, formatNaira, lagosDate } from "@ojarun/shared";
import { BackButton, Pressable, Skeleton, Text } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";

export default function ReceiptScreen() {
  return (
    <RoleGuard role="customer">
      <Receipt />
    </RoleGuard>
  );
}

const ITEM_NOTE = { skipped: "not available", rejected: "rejected" } as const;

/** What was bought for how much, and what came back (05 §9 M6). */
function Receipt() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const r = useQuery(api.orders.receipt, orderId ? { orderId: orderId as Id<"orders"> } : "skip");

  if (r === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={180} />
        <Skeleton height={300} />
      </SafeAreaView>
    );
  }
  if (r === null) {
    return (
      <SafeAreaView className="flex-1 gap-3 bg-bg px-gutter">
        <BackButton />
        <Text variant="heading">Receipt not found</Text>
      </SafeAreaView>
    );
  }

  const leftover = r.credits.filter((c) => c.type === "leftover_credit").reduce((s, c) => s + c.amount, 0);
  const rejection = r.credits.filter((c) => c.type === "rejection_credit").reduce((s, c) => s + c.amount, 0);
  const other = r.back - leftover - rejection;
  const day = r.completedAt ? formatLagosDay(lagosDate(r.completedAt), Date.now()) : null;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View className="bg-forest" style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <SafeAreaView edges={["top"]} className="gap-2.5 px-gutter pb-6 pt-2">
          <BackButton tone="onForest" />
          <Text variant="smallStrong" tone="forestMuted">
            Order {r.code} · {r.marketName}
            {day ? ` · ${day}` : ""}
          </Text>
          <Text variant="title" tone="onForest" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
            {r.status === "completed" ? "Delivered" : r.status === "cancelled" ? "Cancelled" : "Receipt"}
          </Text>
          {r.back > 0 ? (
            <View className="mt-1.5 flex-row items-center justify-between rounded-[18px] p-3.5" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <View className="gap-0.5">
                <Text variant="small" tone="onForestSoft">
                  Back in your wallet
                </Text>
                <Text variant="title" tone="live" tabular style={{ fontSize: 28, lineHeight: 34 }}>
                  {formatNaira(r.back)}
                </Text>
              </View>
              <Pressable onPress={() => router.navigate("/wallet")} accessibilityRole="button" className="justify-center rounded-full bg-surface px-3.5" style={{ height: 40 }}>
                <Text variant="smallStrong" className="font-extrabold">
                  See wallet
                </Text>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </View>

      <View className="gap-4 px-gutter pt-5">
        <View className="rounded-[20px] border border-line bg-surface px-4 py-1">
          {r.items.map((i, k) => {
            const note = i.status === "skipped" || i.status === "rejected" ? ITEM_NOTE[i.status] : i.quantityNote;
            const struck = i.status === "rejected";
            return (
              <View key={i._id} className={`flex-row items-center justify-between gap-3 py-3 ${k < r.items.length - 1 ? "border-b border-line-soft" : ""}`}>
                <Text variant="body" style={{ fontSize: 15, flexShrink: 1 }} numberOfLines={2}>
                  {i.name}
                  {note ? (
                    <Text variant="small" tone={struck ? "error" : "faint"} className={struck ? "font-bold" : ""}>
                      {` · ${note}`}
                    </Text>
                  ) : null}
                </Text>
                <Text
                  variant={i.status === "skipped" || struck ? "body" : "bodyStrong"}
                  tone={i.status === "skipped" || struck ? "faint" : "ink"}
                  tabular
                  style={struck ? { textDecorationLine: "line-through" } : undefined}
                >
                  {formatNaira(i.spent)}
                </Text>
              </View>
            );
          })}
        </View>

        <View className="gap-2.5 rounded-[20px] border border-line bg-surface p-4">
          <Line label="You paid" value={formatNaira(r.paid)} />
          {r.extras > 0 ? <Line label="Extra you approved" value={formatNaira(r.extras)} /> : null}
          {leftover > 0 ? <Line label="Change and unused buffer" value={`−${formatNaira(leftover)}`} good /> : null}
          {rejection > 0 ? <Line label="Refund for rejected items" value={`−${formatNaira(rejection)}`} good /> : null}
          {other > 0 ? <Line label="Other refunds" value={`−${formatNaira(other)}`} good /> : null}
          <View className="h-px bg-line" />
          <View className="flex-row justify-between">
            <Text variant="bodyStrong" className="font-extrabold">
              Your shopping cost
            </Text>
            <Text variant="bodyStrong" tabular className="font-extrabold">
              {formatNaira(r.net)}
            </Text>
          </View>
          <Text variant="caption" tone="faint">
            Includes the {formatNaira(r.totals.serviceFee)} service fee and {formatNaira(r.totals.deliveryFee)} delivery
            {r.totals.paystackCharge ? `, plus a ${formatNaira(r.totals.paystackCharge)} Paystack charge` : ""}.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Line({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View className="flex-row justify-between">
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="smallStrong" tone={good ? "brand" : "ink"} tabular>
        {value}
      </Text>
    </View>
  );
}
