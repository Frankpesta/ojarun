import { useMemo } from "react";
import type { Id } from "@ojarun/convex/dataModel";
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { ArrowRight, Basket, CaretDown, Clock, MagnifyingGlass, MapPin, Plus, Storefront, Wallet } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatLagosClock, formatLagosDay, formatLagosWindow, formatMinutes, formatNaira, haversineMeters, ORDER_STATUS_LABEL, type OrderStatus } from "@ojarun/shared";
import { Button, OfflineBanner, Pressable, Screen, Sticker, Text, stickerFor } from "@/components";
import { CheapestTag, km } from "@/features/list/MarketSheet";
import { useListDraft } from "@/features/list/useListDraft";
import { useOrderSetup } from "@/features/list/useOrderSetup";
import { useMe } from "@/features/auth/useSession";
import { greeting } from "@/lib/time";
import { useTheme } from "@/theme/ThemeProvider";

const MARKET_TINTS = [
  { bg: "bg-brand-tint", ink: "brand" },
  { bg: "bg-accent-tint", ink: "accentStrong" },
  { bg: "bg-warning-tint", ink: "warningInk" },
] as const;

const LIVE = ["paid", "assigned", "shopping", "en_route", "arrived"] as const;

export default function CustomerHome() {
  const me = useMe();
  const orders = useQuery(api.orders.listMine);
  const live = orders?.find((o) => (LIVE as readonly string[]).includes(o.status));
  const firstName = me?.name?.split(/\s+/)[0];

  return (
    <View className="flex-1 bg-bg">
      <Screen tabs>
        <View className="gap-6 pt-3">
          <TopRow balance={me?.walletBalance ?? 0} />
          <View className="gap-1.5">
            <Text variant="title" accessibilityRole="header">
              {firstName ? `${greeting()}, ${firstName}` : greeting()}
            </Text>
            <NextCutoff />
          </View>
          <StartBar onPress={() => router.push({ pathname: "/list", params: { search: "1" } })} />
          {live ? <LiveOrderCard order={live} /> : orders?.length === 0 ? <FirstRunCard onStart={() => router.push("/list")} /> : null}
          <QuickAdd onAdd={(id) => router.push({ pathname: "/list", params: { add: id } })} />
          <Markets />
        </View>
      </Screen>
      <OfflineBanner />
    </View>
  );
}

function TopRow({ balance }: { balance: number }) {
  const { colors } = useTheme();
  const addresses = useQuery(api.addresses.list);
  const address = addresses?.[0];
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Pressable
        scale={false}
        onPress={() => router.push(address ? "/addresses" : "/address")}
        accessibilityRole="button"
        accessibilityLabel={address ? `Delivering to ${address.label}, ${address.formatted}. Change` : "Add a delivery address"}
        className="flex-1 flex-row items-center gap-2.5"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
          <MapPin size={20} color={colors.brand} weight="bold" />
        </View>
        <View className="flex-1">
          <Text variant="caption" tone="faint">
            Deliver to
          </Text>
          <View className="flex-row items-center gap-1">
            <Text variant="smallStrong" numberOfLines={1} style={{ fontSize: 15, flexShrink: 1 }}>
              {address ? `${address.label} · ${address.formatted.split(",")[0]}` : addresses ? "Add your address" : " "}
            </Text>
            <CaretDown size={14} color={colors.ink} weight="bold" />
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.push("/wallet")}
        accessibilityRole="button"
        accessibilityLabel={`Wallet, ${formatNaira(balance)}`}
        className="h-10 flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3"
      >
        <Wallet size={18} color={colors.brand} weight="bold" />
        <Text variant="smallStrong" tabular>
          {formatNaira(balance)}
        </Text>
      </Pressable>
    </View>
  );
}

function NextCutoff() {
  const { colors } = useTheme();
  const days = useQuery(api.slots.available);
  const next = useMemo(() => {
    for (const d of days ?? []) if (d.slots[0]) return { date: d.date, slot: d.slots[0] };
    return null;
  }, [days]);
  if (days === undefined) return <View style={{ height: 28 }} />;
  if (!next) {
    return (
      <Text variant="small" tone="muted">
        No delivery times open right now. Check back soon.
      </Text>
    );
  }
  const day = formatLagosDay(next.date, Date.now()).toLowerCase();
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <View className="flex-row items-center gap-1.5 rounded-full bg-warning-tint px-2.5 py-1">
        <Clock size={15} color={colors.warningInk} weight="bold" />
        <Text variant="smallStrong" tone="warningInk">
          Order by {formatLagosClock(next.slot.cutoffAt)}
        </Text>
      </View>
      <Text variant="small" tone="muted">
        for delivery {formatLagosWindow(next.slot.windowStart, next.slot.windowEnd)} {day}
      </Text>
    </View>
  );
}

function StartBar({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Start a market list"
      className="flex-row items-center gap-3 rounded-[18px] border-[1.5px] border-line-strong bg-surface pl-4 pr-2"
      style={{ height: 60, shadowColor: "#3C2D14", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 }}
    >
      <MagnifyingGlass size={22} color={colors.inkFaint} />
      <Text variant="body" tone="faint" className="flex-1" numberOfLines={1}>
        What do you need from the market?
      </Text>
      <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-brand">
        <Plus size={22} color={colors.onBrand} weight="bold" />
      </View>
    </Pressable>
  );
}

const STEPS = [
  { title: "List it", body: "with a budget for each item" },
  { title: "We shop", body: "and send a photo of each item" },
  { title: "Check at your door.", body: "Change goes to your wallet" },
];

function FirstRunCard({ onStart }: { onStart: () => void }) {
  return (
    <View className="gap-[18px] overflow-hidden rounded-hero bg-forest p-[22px]">
      <View className="absolute" style={{ right: -22, top: -18, transform: [{ rotate: "12deg" }] }}>
        <Sticker kind="tomato" size={88} />
      </View>
      <View className="gap-1.5" style={{ maxWidth: 250 }}>
        <Text variant="caption" tone="live" className="uppercase" style={{ fontSize: 13, letterSpacing: 0.4 }}>
          Your first market run
        </Text>
        <Text variant="heading" tone="onForest" style={{ fontSize: 23, lineHeight: 28 }}>
          Three steps, then dinner is sorted
        </Text>
      </View>
      <View className="gap-3">
        {STEPS.map((s, i) => (
          <View key={s.title} className="flex-row items-center gap-3">
            <View className={`h-[30px] w-[30px] items-center justify-center rounded-full ${i === 0 ? "bg-live" : "bg-on-forest/15"}`}>
              <Text variant="smallStrong" tone="inherit" className={i === 0 ? "text-forest" : "text-on-forest"}>
                {i + 1}
              </Text>
            </View>
            <Text variant="body" tone="onForest" className="flex-1" style={{ fontSize: 15, lineHeight: 20 }}>
              <Text variant="bodyStrong" tone="onForest" style={{ fontSize: 15 }}>
                {s.title}
              </Text>{" "}
              {s.body}
            </Text>
          </View>
        ))}
      </View>
      <Button label="Start my list" variant="onForest" icon={Plus} onPress={onStart} />
    </View>
  );
}

function SectionHeader({ title, aside }: { title: string; aside?: string }) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {aside ? (
        <Text variant="small" tone="faint">
          {aside}
        </Text>
      ) : null}
    </View>
  );
}

function LiveOrderCard({ order }: { order: { _id: string; code: string; status: OrderStatus; marketName: string; itemNames: string[]; itemCount: number; window: { start: number; end: number; date: string } | null } }) {
  const { colors } = useTheme();
  const go = () => router.push({ pathname: "/order/[id]", params: { id: order._id } });
  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel={`Order ${order.code}, ${ORDER_STATUS_LABEL[order.status]}. Track order`} className="gap-3.5 rounded-hero bg-forest p-[18px]">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <View className="items-center justify-center rounded-full bg-live/20" style={{ width: 16, height: 16 }}>
            <View className="rounded-full bg-live" style={{ width: 8, height: 8 }} />
          </View>
          <Text variant="smallStrong" tone="forestMuted" style={{ fontSize: 13 }}>
            Live · Order {order.code}
          </Text>
        </View>
        {order.window ? (
          <Text variant="small" tone="forestMuted" style={{ fontSize: 13 }}>
            {formatLagosWindow(order.window.start, order.window.end)} {formatLagosDay(order.window.date, Date.now()).toLowerCase()}
          </Text>
        ) : null}
      </View>
      <View className="gap-1">
        <Text variant="heading" tone="onForest" style={{ fontSize: 21, lineHeight: 26 }}>
          {order.status === "paid" || order.status === "assigned" ? `Confirmed for ${order.marketName}` : `${ORDER_STATUS_LABEL[order.status]} · ${order.marketName}`}
        </Text>
        <Text variant="small" tone="onForestSoft">
          {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · we'll tell you when shopping starts
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="flex-row gap-1.5">
          {order.itemNames.slice(0, 3).map((n, i) => {
            const kind = stickerFor(n);
            return kind ? <Sticker key={`${n}-${i}`} kind={kind} size={36} /> : null;
          })}
        </View>
        <View className="h-10 flex-row items-center gap-1.5 rounded-[12px] bg-on-forest px-3.5">
          <Text variant="smallStrong" tone="inherit" className="text-forest">
            Track order
          </Text>
          <ArrowRight size={16} color={colors.forest} weight="bold" />
        </View>
      </View>
    </Pressable>
  );
}

function QuickAdd({ onAdd }: { onAdd: (id: Id<"catalogItems">) => void }) {
  const { colors } = useTheme();
  const items = useQuery(api.catalog.featured);
  if (!items?.length) return null;
  return (
    <View className="gap-3">
      <SectionHeader title="Quick add" aside="Tap to start a list" />
      <View className="flex-row flex-wrap" style={{ marginHorizontal: -5, rowGap: 14 }}>
        {items.map((it) => {
          const kind = stickerFor(it.name);
          return (
            <Pressable
              key={it._id}
              onPress={() => onAdd(it._id)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${it.name}`}
              className="gap-1.5"
              style={{ width: "25%", paddingHorizontal: 5 }}
            >
              <View>
                {kind ? (
                  <Sticker kind={kind} size={78} />
                ) : (
                  <View className="items-center justify-center rounded-[24px] bg-surface-sunken" style={{ width: 78, height: 78 }}>
                    <Basket size={34} color={colors.inkFaint} weight="duotone" />
                  </View>
                )}
                <View
                  className="absolute h-7 w-7 items-center justify-center rounded-full bg-surface"
                  style={{ top: 52, right: 0, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 }}
                >
                  <Plus size={15} color={colors.brand} weight="bold" />
                </View>
              </View>
              <Text variant="smallStrong" numberOfLines={1}>
                {it.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Markets() {
  const { colors } = useTheme();
  const markets = useQuery(api.markets.listActive);
  const setMarket = useListDraft((s) => s.setMarket);
  const { address, quotes } = useOrderSetup();

  // Real delivery fees once quoted; straight-line distance only as a placeholder before that.
  const rows = useMemo(() => {
    if (quotes) return quotes.map((q) => ({ _id: q.marketId, name: q.name, opensAtMin: q.opensAtMin, closesAtMin: q.closesAtMin, meters: q.distanceMeters, fee: q.deliveryFee as number | null }));
    if (!markets) return [];
    const withDistance = markets.map((m) => ({ ...m, meters: address ? haversineMeters(address, m) : null, fee: null as number | null }));
    if (address) withDistance.sort((a, b) => (a.meters ?? 0) - (b.meters ?? 0));
    return withDistance;
  }, [markets, quotes, address]);

  if (!rows.length) return null;
  return (
    <View className="gap-3">
      <SectionHeader title={address ? "Markets near you" : "Markets we shop"} aside={address ? "Closer = cheaper delivery" : undefined} />
      <View className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((m, i) => {
          const tint = MARKET_TINTS[i % MARKET_TINTS.length]!;
          return (
            <Pressable
              key={m._id}
              scale={false}
              onPress={() => {
                setMarket(m._id);
                router.push("/list");
              }}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}${m.meters != null ? `, ${km(m.meters)}` : ""}${m.fee != null ? `, delivery ${formatNaira(m.fee)}` : ""}. Shop here`}
              className={`flex-row items-center gap-3.5 px-4 py-3.5 ${i < rows.length - 1 ? "border-b border-line-soft" : ""}`}
            >
              <View className={`h-12 w-12 items-center justify-center rounded-[14px] ${tint.bg}`}>
                <Storefront size={24} color={colors[tint.ink]} />
              </View>
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {m.name}
                  </Text>
                  {quotes && i === 0 ? <CheapestTag /> : null}
                </View>
                <Text variant="small" tone="faint">
                  {m.meters != null ? `${km(m.meters)} · ` : ""}open till {formatMinutes(m.closesAtMin)}
                </Text>
              </View>
              {m.fee != null ? (
                <View className="items-end">
                  <Text variant="bodyStrong" tabular style={{ fontSize: 15 }}>
                    {formatNaira(m.fee)}
                  </Text>
                  <Text variant="caption" tone="faint">
                    delivery
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
