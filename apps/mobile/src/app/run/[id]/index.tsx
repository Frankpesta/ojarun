import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useNetInfo } from "@react-native-community/netinfo";
import { CaretRight, Phone, Storefront, WifiSlash, CloudArrowUp } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosWindow, formatNaira, type ItemStatus } from "@ojarun/shared";
import { BackButton, Button, Pressable, Skeleton, Sticker, Text, stickerFor } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { FallbackTile } from "@/features/list/ItemSheet";
import { currentLocation } from "@/features/shopper/location";
import { OrderBadge } from "@/features/shopper/orderBadge";
import { pendingForBatch, queuedOutcome, startQueued, useUploadQueue } from "@/features/shopper/useUploadQueue";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Batch = NonNullable<FunctionReturnType<typeof api.shopper.batch>>;
type Order = Batch["orders"][number];
type Item = Order["items"][number];

export default function RunScreen() {
  return (
    <RoleGuard role="shopper">
      <Run />
    </RoleGuard>
  );
}

function Run() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const batch = useQuery(api.shopper.batch, id ? { batchId: id as Id<"batches"> } : "skip");
  const jobs = useUploadQueue((s) => s.jobs);

  if (batch === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={120} />
        <Skeleton height={320} />
      </SafeAreaView>
    );
  }
  if (batch === null) {
    return (
      <SafeAreaView className="flex-1 gap-3 bg-bg px-gutter">
        <BackButton />
        <Text variant="heading">This run isn't yours any more</Text>
        <Text variant="body" tone="muted">
          Ops may have given it to another shopper. Check Today for your current runs.
        </Text>
      </SafeAreaView>
    );
  }
  const started = batch.status === "in_progress" || startQueued(jobs, batch._id);
  return started ? <ShoppingList batch={batch} /> : <BeforeStart batch={batch} />;
}

const itemCount = (b: Batch) => b.orders.reduce((n, o) => n + o.items.length, 0);
const budgetTotal = (b: Batch) => b.orders.reduce((n, o) => n + o.items.reduce((m, i) => m + i.budget, 0), 0);
const windowLabel = (b: Batch) => (b.window ? `Deliver ${formatLagosWindow(b.window.start, b.window.end)}` : "");

function ItemArt({ name, size }: { name: string; size: number }) {
  const kind = stickerFor(name);
  return kind ? <Sticker kind={kind} size={size} /> : <FallbackTile size={size} />;
}

function BeforeStart({ batch }: { batch: Batch }) {
  const { colors } = useTheme();
  const enqueue = useUploadQueue((s) => s.enqueue);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    haptic.success();
    const loc = await currentLocation();
    enqueue(batch._id, { type: "startShopping", batchId: batch._id, ...(loc ?? {}) });
    setStarting(false);
  };

  return (
    <View className="flex-1 bg-bg">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="bg-forest" style={{ borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
          <SafeAreaView edges={["top"]} className="gap-4 px-gutter pb-[22px] pt-2">
            <View className="flex-row items-center justify-between">
              <BackButton tone="onForest" />
              <Text variant="smallStrong" tone="forestMuted">
                {windowLabel(batch)}
              </Text>
            </View>
            <View className="gap-1.5">
              <Text variant="title" tone="onForest" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
                {batch.market?.name ?? "Market run"}
              </Text>
              <Text variant="body" tone="onForestSoft" style={{ fontSize: 15 }}>
                {batch.orders.length} {batch.orders.length === 1 ? "order" : "orders"} · {itemCount(batch)} items · {formatNaira(budgetTotal(batch))} in budgets
              </Text>
            </View>
          </SafeAreaView>
        </View>

        <View className="gap-3.5 px-gutter pt-5">
          {batch.orders.map((order, index) => (
            <View key={order._id} className="overflow-hidden rounded-card border border-line bg-surface">
              <View className="flex-row items-center gap-3 p-3.5">
                <OrderBadge index={index} />
                <View className="flex-1 gap-0.5">
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {order.customer.firstName} · #{order.code}
                  </Text>
                  <Text variant="small" tone="faint" numberOfLines={1}>
                    {order.address.landmark}
                  </Text>
                </View>
                {order.customer.phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${order.customer.firstName}`}
                    className="items-center justify-center rounded-full bg-surface-sunken"
                    style={{ width: 44, height: 44 }}
                  >
                    <Phone size={19} color={colors.forest} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
              <View className="px-3.5 pb-1.5">
                {order.items.map((item) => (
                  <View key={item._id} className="flex-row items-center gap-2.5 border-t border-line-soft py-2">
                    <ItemArt name={item.name} size={36} />
                    <View className="flex-1">
                      <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.preferences.length || item.note ? (
                        <Text variant="caption" tone="faint" numberOfLines={1}>
                          {[...item.preferences, item.note].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="bodyStrong" tabular style={{ fontSize: 15 }} className="font-extrabold">
                      {formatNaira(item.budget)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} className="gap-2.5 border-t border-line bg-surface px-gutter pt-3.5 pb-3">
        <Text variant="small" tone="muted" className="text-center">
          Tap this when you reach the market. Customers can't cancel after you start.
        </Text>
        <Button label="Start shopping" icon={Storefront} size="lg" loading={starting} onPress={() => void start()} />
      </SafeAreaView>
    </View>
  );
}

function ShoppingList({ batch }: { batch: Batch }) {
  const { colors } = useTheme();
  const jobs = useUploadQueue((s) => s.jobs);
  const { isConnected } = useNetInfo();
  const [tab, setTab] = useState<"todo" | "done">("todo");

  const rows = batch.orders.flatMap((order, index) =>
    order.items.map((item) => {
      const queued = queuedOutcome(jobs, item._id);
      const status: ItemStatus = queued?.outcome ?? item.status;
      return { item, order, index, status };
    }),
  );
  const done = rows.filter((r) => r.status !== "pending");
  const todo = rows.filter((r) => r.status === "pending");
  const shown = tab === "todo" ? todo : done;
  const waiting = pendingForBatch(jobs, batch._id).length;
  const pct = rows.length ? Math.round((done.length / rows.length) * 100) : 0;
  const offline = isConnected === false;

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 px-gutter" contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="flex-row items-center justify-between pt-2">
            <BackButton />
            <Text variant="smallStrong" tone="muted">
              {windowLabel(batch)}
            </Text>
          </View>
          <View className="gap-2.5">
            <Text variant="title" accessibilityRole="header">
              {batch.market?.name ?? "Market run"}
            </Text>
            <View className="h-2 overflow-hidden rounded-full bg-line" accessible accessibilityLabel={`${done.length} of ${rows.length} done`}>
              <View className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
            </View>
            <Text variant="smallStrong">
              {done.length} of {rows.length} done
            </Text>
          </View>

          {waiting ? (
            <Pressable
              onPress={() => router.navigate("/(shopper)/queue")}
              accessibilityRole="button"
              className="flex-row items-center gap-2.5 rounded-input bg-warning-tint px-3 py-2.5"
            >
              {offline ? <WifiSlash size={18} color={colors.warningInk} weight="bold" /> : <CloudArrowUp size={18} color={colors.warningInk} weight="bold" />}
              <Text variant="small" tone="warningInk" className="flex-1 font-semibold">
                {offline
                  ? `No signal. ${waiting} ${waiting === 1 ? "update" : "updates"} will send when you're back online.`
                  : `Sending ${waiting} ${waiting === 1 ? "update" : "updates"}…`}
              </Text>
            </Pressable>
          ) : null}

          <View accessibilityRole="tablist" className="flex-row gap-1.5 rounded-input bg-line p-1">
            {(
              [
                ["todo", `To buy · ${todo.length}`],
                ["done", `Done · ${done.length}`],
              ] as const
            ).map(([key, label]) => {
              const on = tab === key;
              return (
                <Pressable
                  key={key}
                  scale={false}
                  onPress={() => {
                    haptic.select();
                    setTab(key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  className={`h-[38px] flex-1 items-center justify-center rounded-[11px] ${on ? "bg-surface" : ""}`}
                >
                  <Text variant="smallStrong" tone={on ? "ink" : "muted"} className={on ? "font-extrabold" : ""}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {shown.length === 0 ? (
            <View className="items-center gap-1 rounded-card border border-line bg-surface px-5 py-8">
              <Text variant="bodyStrong">{tab === "todo" ? "Everything's done" : "Nothing done yet"}</Text>
              <Text variant="small" tone="muted" className="text-center">
                {tab === "todo" ? "Check Done to review what you bought." : "Tap an item to photograph it and record what happened."}
              </Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-card border border-line bg-surface">
              {shown.map((r, i) => (
                <ItemRow key={r.item._id} row={r} batchId={batch._id} last={i === shown.length - 1} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} className="gap-2.5 border-t border-line bg-surface px-gutter pt-3.5 pb-3">
        <Button label="Head out to deliver" size="lg" disabled />
        <Text variant="small" tone="faint" className="text-center">
          {todo.length
            ? `Finish all ${rows.length} items${waiting ? " and wait for uploads" : ""} first`
            : waiting
              ? "Waiting for uploads to finish"
              : "Delivery steps arrive in the next app update"}
        </Text>
      </SafeAreaView>
    </View>
  );
}

const STATUS_WORD: Record<ItemStatus, string> = { pending: "", bought: "Bought", adjusted: "Changed", skipped: "Not there", rejected: "Rejected" };

function ItemRow({ row, batchId, last }: { row: { item: Item; order: Order; index: number; status: ItemStatus }; batchId: string; last: boolean }) {
  const { colors } = useTheme();
  const { item, order, index, status } = row;
  const sub = status === "pending" ? [...item.preferences, item.note].filter(Boolean).join(" · ") || order.customer.firstName : STATUS_WORD[status];
  return (
    <Pressable
      scale={false}
      onPress={() => router.push({ pathname: "/run/[id]/item/[itemId]", params: { id: batchId, itemId: item._id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} for ${order.customer.firstName}, budget ${formatNaira(item.budget)}${status === "pending" ? "" : `, ${STATUS_WORD[status]}`}`}
      className={`flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunken ${last ? "" : "border-b border-line-soft"}`}
    >
      <View>
        <ItemArt name={item.name} size={48} />
        <View className="absolute -left-1 -top-1 rounded-full border-2 border-surface">
          <OrderBadge index={index} size={20} />
        </View>
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="small" tone={status === "pending" ? "faint" : "brand"} numberOfLines={1} className={status === "pending" ? "" : "font-semibold"}>
          {sub}
        </Text>
      </View>
      <Text variant="bodyStrong" tabular className="font-extrabold">
        {formatNaira(item.budget + item.approvedExtra)}
      </Text>
      <CaretRight size={16} color={colors.inkFaint} weight="bold" />
    </Pressable>
  );
}
