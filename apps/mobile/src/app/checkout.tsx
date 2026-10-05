import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Switch, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Info, Lock, MapPin, ShieldCheck, Storefront, Wallet } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { fontFamily } from "@ojarun/ui";
import { bufferAmount, formatLagosClock, formatLagosDay, formatLagosWindow, formatNaira, orderTotals } from "@ojarun/shared";
import { BackButton, Button, Pressable, Skeleton, Text, useSheet, useToast } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { AddressPickSheet } from "@/features/checkout/AddressPickSheet";
import { BufferSheet } from "@/features/checkout/BufferSheet";
import { usePayment } from "@/features/checkout/usePayment";
import { MarketSheet, km } from "@/features/list/MarketSheet";
import { useListDraft } from "@/features/list/useListDraft";
import { useOrderSetup } from "@/features/list/useOrderSetup";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function CheckoutScreen() {
  return (
    <RoleGuard role="customer">
      <Checkout />
    </RoleGuard>
  );
}

function Checkout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const me = useMe();
  const settings = useQuery(api.settings.publicSettings);
  const days = useQuery(api.slots.available);
  const { items, setMarket, setAddress, clear } = useListDraft();
  const setup = useOrderSetup();
  const { pay, busy } = usePayment();

  const marketSheet = useSheet();
  const addressSheet = useSheet();
  const bufferSheet = useSheet();

  const [slotId, setSlotId] = useState<Id<"slots"> | null>(null);
  const [bufferPct, setBufferPct] = useState<number | null>(null);
  const [useWallet, setUseWallet] = useState(true);

  const slots = useMemo(
    () => (days ?? []).flatMap((d) => d.slots.map((s) => ({ ...s, day: formatLagosDay(d.date, Date.now()) }))),
    [days],
  );
  // Default to the earliest open window; drop the choice if it closes or fills while we're here.
  useEffect(() => {
    if (!days) return;
    if (!slotId || !slots.some((s) => s._id === slotId)) setSlotId(slots[0]?._id ?? null);
  }, [days, slots, slotId]);
  useEffect(() => {
    if (settings && bufferPct === null) setBufferPct(settings.defaultBufferPct);
  }, [settings, bufferPct]);
  // An empty list has nothing to check out, unless we just emptied it by placing the order.
  const placed = useRef(false);
  useEffect(() => {
    if (items.length === 0 && !busy && !placed.current) router.replace("/list");
  }, [items.length, busy]);

  const balance = me?.walletBalance ?? 0;
  const totals =
    settings && setup.market && bufferPct !== null
      ? orderTotals({
          itemBudgets: items.map((i) => i.budget),
          bufferPct,
          deliveryFee: setup.market.deliveryFee,
          walletBalance: balance,
          applyWallet: useWallet && balance > 0,
          settings,
        })
      : null;

  const ready = !!totals && !!slotId && !!setup.address && !!setup.market;

  const onPay = async () => {
    if (!ready || !totals) return;
    try {
      const result = await pay({
        addressId: setup.address!._id,
        marketId: setup.market!.marketId,
        slotId: slotId!,
        items: items.map(({ name, catalogItemId, budget, preferences, note }) => ({ name, catalogItemId, budget, preferences, note })),
        bufferPct: bufferPct!,
        applyWallet: useWallet && balance > 0,
      });
      if (result.kind === "paid") {
        haptic.success();
        placed.current = true;
        clear();
        router.replace({ pathname: "/placed", params: { id: result.orderId } });
      } else {
        toast.show({ message: "Payment wasn't completed. Your list is saved; tap Pay to try again." });
      }
    } catch (e) {
      haptic.error();
      const code = e instanceof ConvexError ? (e.data as { code?: string }).code : undefined;
      if (code === "SLOT_FULL" || code === "SLOT_CLOSED") setSlotId(null);
      toast.show({ message: friendlyError(e, "We couldn't place your order. Check your connection and try again."), tone: "error" });
    }
  };

  const payLabel = !totals
    ? "Pay"
    : totals.chargeAmount === 0
      ? `Place order · paid from wallet`
      : `Pay ${formatNaira(totals.chargeAmount)}`;

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <View className="flex-row items-center gap-1 px-gutter pt-2">
          <BackButton />
          <Text variant="heading" accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28 }}>
            Checkout
          </Text>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-gutter gap-5" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View className="gap-2.5">
            <SectionTitle>When should it arrive?</SectionTitle>
            {days === undefined ? (
              <Skeleton height={92} />
            ) : slots.length === 0 ? (
              <View className="rounded-card border border-line bg-surface p-4">
                <Text variant="bodyStrong">No delivery times open right now</Text>
                <Text variant="small" tone="muted">
                  Today's orders have closed. Check back after midnight for tomorrow's times.
                </Text>
              </View>
            ) : (
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {slots.map((s) => {
                  const on = s._id === slotId;
                  return (
                    <Pressable
                      key={s._id}
                      onPress={() => {
                        haptic.select();
                        setSlotId(s._id);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${s.day}, ${formatLagosWindow(s.windowStart, s.windowEnd)}. Order by ${formatLagosClock(s.cutoffAt)}`}
                      className={`gap-1 rounded-button p-3 ${on ? "bg-forest" : "bg-surface"}`}
                      style={{ width: "31.8%", borderWidth: on ? 0 : 1.5, borderColor: colors.lineStrong }}
                    >
                      <Text variant="caption" tone={on ? "forestMuted" : "faint"}>
                        {s.day}
                      </Text>
                      <Text variant="bodyStrong" tone={on ? "onForest" : "ink"} style={{ fontSize: 17 }} numberOfLines={1} adjustsFontSizeToFit>
                        {formatLagosWindow(s.windowStart, s.windowEnd)}
                      </Text>
                      <Text variant="caption" tone={on ? "onForestSoft" : "faint"}>
                        {s.remaining <= 2 ? `${s.remaining} left · ` : ""}by {formatLagosClock(s.cutoffAt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View className="overflow-hidden rounded-card border border-line bg-surface">
            <ChoiceRow
              icon={<MapPin size={20} color={colors.brand} weight="bold" />}
              title={setup.address ? setup.address.formatted.split(",")[0]! : " "}
              subtitle={setup.address?.landmark ?? ""}
              onPress={() => addressSheet.present()}
              label="Change delivery address"
            />
            <View className="h-px bg-line-soft" />
            <ChoiceRow
              icon={<Storefront size={20} color={colors.brand} weight="bold" />}
              title={setup.market?.name ?? (setup.quotesError ? "Choose a market" : "Finding markets…")}
              subtitle={setup.market ? `${km(setup.market.distanceMeters)} away · ${items.length} ${items.length === 1 ? "item" : "items"}` : (setup.quotesError ?? "")}
              onPress={() => marketSheet.present()}
              label="Change market"
            />
          </View>

          {settings && bufferPct !== null ? (
            <View className="gap-2.5">
              <View className="flex-row items-center justify-between">
                <SectionTitle>Price-rise buffer</SectionTitle>
                <Pressable
                  onPress={() => bufferSheet.present()}
                  accessibilityRole="button"
                  accessibilityLabel="What's the buffer?"
                  className="flex-row items-center gap-1 px-1"
                  style={{ minHeight: 44 }}
                >
                  <Info size={18} color={colors.brand} weight="bold" />
                  <Text variant="smallStrong" tone="brand">
                    How it works
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row gap-2">
                {settings.bufferPresets.map((pct) => {
                  const on = pct === bufferPct;
                  const amount = bufferAmount(totals?.budgets ?? items.reduce((s, i) => s + i.budget, 0), pct, settings.bufferRoundToKobo);
                  return (
                    <Pressable
                      key={pct}
                      onPress={() => {
                        haptic.select();
                        setBufferPct(pct);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={pct === 0 ? "No buffer" : `${pct} percent buffer, ${formatNaira(amount)}`}
                      className={`flex-1 items-center justify-center gap-0.5 rounded-[14px] ${on ? "bg-brand-tint" : "bg-surface"}`}
                      style={{ minHeight: 60, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.brand : colors.lineStrong }}
                    >
                      <Text variant="bodyStrong" tone={on ? "inherit" : "ink"} className={on ? "text-brand-pressed" : ""} style={{ fontSize: 15 }}>
                        {pct === 0 ? "None" : `${pct}%`}
                      </Text>
                      <Text variant="caption" tone="faint" tabular>
                        {pct === 0 ? "Ask me" : formatNaira(amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="small" tone="faint">
                {bufferPct === 0
                  ? "Any price rise you approve comes from your wallet."
                  : "Covers price rises you approve. Whatever isn't used comes back to your wallet."}
              </Text>
            </View>
          ) : null}

          <View className="gap-3 rounded-card border border-line bg-surface p-4">
            <SectionTitle>Summary</SectionTitle>
            {totals ? (
              <>
                <Line label="Item budgets" value={formatNaira(totals.budgets)} />
                {totals.buffer > 0 ? <Line label={`Buffer (${bufferPct}%)`} value={formatNaira(totals.buffer)} /> : null}
                <Line label="Service fee" value={formatNaira(totals.serviceFee)} />
                <Line label={`Delivery from ${setup.market!.name}`} value={formatNaira(totals.deliveryFee)} />
                {totals.paystackCharge > 0 ? <Line label="Paystack charge" value={formatNaira(totals.paystackCharge)} /> : null}
                {balance > 0 ? (
                  <View className="flex-row items-center justify-between rounded-[12px] bg-brand-tint px-3 py-2">
                    <View className="flex-1 flex-row items-center gap-2">
                      <Wallet size={18} color={colors.brandPressed} weight="bold" />
                      <Text variant="smallStrong" tone="inherit" className="text-brand-pressed">
                        Use wallet credit
                      </Text>
                    </View>
                    <Text variant="smallStrong" tone="inherit" className="mr-2 text-brand-pressed" tabular>
                      {useWallet ? `−${formatNaira(totals.walletApplied)}` : formatNaira(balance)}
                    </Text>
                    <Switch
                      value={useWallet}
                      onValueChange={(v) => {
                        haptic.select();
                        setUseWallet(v);
                      }}
                      accessibilityLabel="Use wallet credit"
                      trackColor={{ true: colors.brand, false: colors.lineStrong }}
                      thumbColor={colors.surface}
                    />
                  </View>
                ) : null}
                <View className="h-px bg-line-soft" />
                <View className="flex-row items-baseline justify-between">
                  <Text variant="bodyStrong">{totals.walletApplied > 0 ? "To pay now" : "Total"}</Text>
                  <Text variant="heading" tabular style={{ fontSize: 22, lineHeight: 28 }}>
                    {formatNaira(totals.chargeAmount)}
                  </Text>
                </View>
              </>
            ) : setup.quotesError ? (
              <View className="gap-3">
                <Text variant="small" tone="error">
                  {setup.quotesError}
                </Text>
                <Button label="Try again" variant="secondary" size="sm" onPress={setup.retryQuotes} />
              </View>
            ) : (
              <View className="gap-2">
                <Skeleton height={18} />
                <Skeleton height={18} />
                <Skeleton height={18} />
              </View>
            )}
          </View>

          <View className="gap-3 px-1">
            <Policy icon={<ShieldCheck size={18} color={colors.brand} weight="bold" />}>
              Money your shopper doesn't spend comes back to your wallet when you accept the delivery.
            </Policy>
            <Policy icon={<Info size={18} color={colors.inkMuted} weight="bold" />}>
              {`Cancel for free until shopping starts. The refund goes to your wallet${
                totals?.paystackCharge ? `, minus the ${formatNaira(totals.paystackCharge)} Paystack charge` : ""
              }. Once you accept the delivery, it's final.`}
            </Policy>
          </View>
        </ScrollView>

        <View className="gap-2 border-t border-line bg-surface px-gutter pt-3.5" style={{ paddingBottom: Math.max(insets.bottom, 12) + 14 }}>
          <Button label={payLabel} icon={totals?.chargeAmount ? Lock : undefined} loading={busy} disabled={!ready} onPress={() => void onPay()} />
          {busy ? (
            <View className="flex-row items-center justify-center gap-2">
              <ActivityIndicator size="small" color={colors.inkMuted} />
              <Text variant="caption" tone="faint">
                Finish paying in the Paystack window
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <MarketSheet
        sheet={marketSheet}
        quotes={setup.quotes}
        error={setup.quotesError}
        onRetry={setup.retryQuotes}
        selected={setup.market?.marketId ?? null}
        onSelect={setMarket}
      />
      <AddressPickSheet sheet={addressSheet} addresses={setup.addresses ?? []} selected={setup.address?._id} onSelect={setAddress} />
      <BufferSheet sheet={bufferSheet} />
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="bodyStrong" accessibilityRole="header">
      {children}
    </Text>
  );
}

function ChoiceRow({ icon, title, subtitle, onPress, label }: { icon: React.ReactNode; title: string; subtitle: string; onPress: () => void; label: string }) {
  return (
    <Pressable scale={false} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${label}`} className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-brand-tint">{icon}</View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="faint" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text variant="smallStrong" tone="brand">
        Change
      </Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <Text variant="body" tone="muted" className="flex-1" style={{ fontSize: 15 }}>
        {label}
      </Text>
      <Text variant="body" tabular style={{ fontSize: 15, fontFamily: fontFamily.semibold }}>
        {value}
      </Text>
    </View>
  );
}

function Policy({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <View className="flex-row gap-2.5">
      <View style={{ marginTop: 1 }}>{icon}</View>
      <Text variant="small" tone="muted" className="flex-1" style={{ lineHeight: 19, fontSize: 13 }}>
        {children}
      </Text>
    </View>
  );
}
