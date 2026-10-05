import { View } from "react-native";
import { router } from "expo-router";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Plus } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatLagosDay, formatLagosWindow, formatNaira, ORDER_STATUS_LABEL, type OrderStatus } from "@ojarun/shared";
import { Button, Pressable, Screen, Skeleton, Sticker, Text, stickerFor, useToast } from "@/components";
import { FallbackTile } from "@/features/list/ItemSheet";
import { useListDraft } from "@/features/list/useListDraft";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Summary = FunctionReturnType<typeof api.orders.listMine>[number];

const ACTIVE: readonly OrderStatus[] = ["pending_payment", "paid", "assigned", "shopping", "en_route", "arrived"];

export default function CustomerOrders() {
  const orders = useQuery(api.orders.listMine);
  const active = orders?.filter((o) => ACTIVE.includes(o.status)) ?? [];
  const past = orders?.filter((o) => !ACTIVE.includes(o.status)) ?? [];

  return (
    <Screen title="Orders" tabs>
      {orders === undefined ? (
        <View className="gap-3">
          <Skeleton height={120} />
          <Skeleton height={80} />
        </View>
      ) : orders.length === 0 ? (
        <NoOrders />
      ) : (
        <View className="gap-5">
          {active.map((o) => (
            <ActiveCard key={o._id} order={o} />
          ))}
          {past.length ? (
            <View className="gap-3">
              <Text variant="heading" accessibilityRole="header">
                Past orders
              </Text>
              <View className="overflow-hidden rounded-card border border-line bg-surface">
                {past.map((o, i) => (
                  <PastRow key={o._id} order={o} last={i === past.length - 1} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function when(o: Summary) {
  return o.window ? `${formatLagosDay(o.window.date, Date.now())} · ${formatLagosWindow(o.window.start, o.window.end)}` : "";
}

function Stack({ names, size }: { names: string[]; size: number }) {
  const shown = names.slice(0, 3);
  return (
    <View className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
      {shown.map((n, i) => {
        const kind = stickerFor(n);
        return (
          <View key={`${n}-${i}`} style={{ marginLeft: i ? -12 : 0 }}>
            {kind ? <Sticker kind={kind} size={size} /> : <FallbackTile size={size} />}
          </View>
        );
      })}
    </View>
  );
}

function ActiveCard({ order }: { order: Summary }) {
  const { colors } = useTheme();
  const waiting = order.status === "pending_payment";
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/order/[id]", params: { id: order._id } })}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.code} from ${order.marketName}, ${ORDER_STATUS_LABEL[order.status]}. ${when(order)}`}
      className="gap-3 rounded-[22px] bg-surface p-4"
      style={{ borderWidth: 2, borderColor: waiting ? colors.warning : colors.brand }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View
            className="items-center justify-center rounded-full"
            style={{ width: 16, height: 16, backgroundColor: waiting ? colors.warningTint : colors.brandTint }}
          >
            <View className="rounded-full" style={{ width: 8, height: 8, backgroundColor: waiting ? colors.warning : colors.brand }} />
          </View>
          <Text variant="caption" tone={waiting ? "warningInk" : "brand"} className="uppercase" style={{ fontSize: 13, letterSpacing: 0.3 }}>
            {waiting ? "Awaiting payment" : "In progress"}
          </Text>
        </View>
        <Text variant="small" tone="faint">
          {when(order)}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Stack names={order.itemNames} size={44} />
        <View className="flex-1 gap-0.5">
          <Text variant="bodyStrong" numberOfLines={1}>
            Order {order.code} · {order.marketName}
          </Text>
          <Text variant="small" tone="faint">
            {ORDER_STATUS_LABEL[order.status]} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function PastRow({ order, last }: { order: Summary; last: boolean }) {
  const convex = useConvex();
  const toast = useToast();
  const add = useListDraft((s) => s.add);
  const draft = useListDraft((s) => s.items);
  const settings = useQuery(api.settings.publicSettings);
  const delivered = order.status === "completed";

  const reorder = async () => {
    try {
      const full = await convex.query(api.orders.get, { orderId: order._id });
      if (!full) return;
      const onList = new Set(draft.map((d) => d.name.toLowerCase()));
      const room = (settings?.maxItemsPerOrder ?? 25) - draft.length;
      const fresh = full.items.filter((i) => !onList.has(i.name.toLowerCase())).slice(0, Math.max(0, room));
      for (const i of fresh) {
        add({ name: i.name, catalogItemId: i.catalogItemId ?? undefined, budget: i.budget, preferences: i.preferences, note: i.note ?? undefined });
      }
      haptic.success();
      if (draft.length) toast.show({ message: fresh.length ? `Added ${fresh.length} items to your list` : "Those items are already on your list" });
      router.push("/list");
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    }
  };

  return (
    <Pressable
      scale={false}
      onPress={() => router.push({ pathname: "/order/[id]", params: { id: order._id } })}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.code} from ${order.marketName}, ${ORDER_STATUS_LABEL[order.status]}`}
      className={`flex-row items-center gap-3 px-4 py-3.5 ${last ? "" : "border-b border-line-soft"}`}
    >
      <Stack names={order.itemNames.slice(0, 1)} size={48} />
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {order.itemNames.slice(0, 2).join(" + ")}
          {order.itemCount > 2 ? ` +${order.itemCount - 2}` : ""} · {order.marketName}
        </Text>
        <Text variant="small" tone="faint">
          {order.window ? formatLagosDay(order.window.date, Date.now()) : ""} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} ·{" "}
          {formatNaira(order.total)}
        </Text>
        <Text variant="caption" tone={delivered ? "brand" : "faint"} className="uppercase" style={{ letterSpacing: 0.3 }}>
          {ORDER_STATUS_LABEL[order.status]}
        </Text>
      </View>
      <Button label="Reorder" variant="soft" size="sm" fullWidth={false} onPress={() => void reorder()} />
    </Pressable>
  );
}

function NoOrders() {
  return (
    <View className="items-center gap-5 rounded-hero border border-line bg-surface px-6 py-10">
      <View className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
        <View style={{ transform: [{ rotate: "-8deg" }] }}>
          <Sticker kind="tomato" size={64} />
        </View>
        <View style={{ marginLeft: -14, marginTop: -8, transform: [{ rotate: "6deg" }] }}>
          <Sticker kind="fish" size={64} />
        </View>
        <View style={{ marginLeft: -14, transform: [{ rotate: "-4deg" }] }}>
          <Sticker kind="plantain" size={64} />
        </View>
      </View>
      <View className="items-center gap-2">
        <Text variant="heading" className="text-center">
          No orders yet
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          Your market runs show up here, with a photo of every item we buy and the change we send back.
        </Text>
      </View>
      <Button label="Start a list" icon={Plus} fullWidth={false} onPress={() => router.push("/list")} />
    </View>
  );
}
