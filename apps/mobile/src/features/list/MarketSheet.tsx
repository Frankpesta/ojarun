import { ActivityIndicator, View } from "react-native";
import { Check, Storefront } from "phosphor-react-native";
import type { Id } from "@ojarun/convex/dataModel";
import { formatMinutes, formatNaira } from "@ojarun/shared";
import { Button, Pressable, Sheet, Text, type SheetController } from "@/components";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import type { MarketQuote } from "./useMarketQuotes";

export const MARKET_TINTS = [
  { bg: "bg-brand-tint", ink: "brand" },
  { bg: "bg-accent-tint", ink: "accentStrong" },
  { bg: "bg-warning-tint", ink: "warningInk" },
] as const;

export const km = (meters: number) => `${(meters / 1000).toFixed(1)} km`;

/** Pick where your shopper buys. Closer markets cost less to deliver from. */
export function MarketSheet({
  sheet,
  quotes,
  error,
  onRetry,
  selected,
  onSelect,
}: {
  sheet: SheetController;
  quotes: MarketQuote[] | undefined;
  error: string | null;
  onRetry: () => void;
  selected: Id<"markets"> | null;
  onSelect: (id: Id<"markets">) => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet sheet={sheet} title="Choose a market" subtitle="Your shopper buys everything on your list here. Closer means cheaper delivery.">
      {error ? (
        <View className="gap-3 pb-2">
          <Text variant="small" tone="error">
            {error}
          </Text>
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : quotes === undefined ? (
        <View className="items-center py-8">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <View className="overflow-hidden rounded-card border border-line bg-surface">
          {quotes.map((q, i) => {
            const on = q.marketId === selected;
            const tint = MARKET_TINTS[i % MARKET_TINTS.length]!;
            return (
              <Pressable
                key={q.marketId}
                scale={false}
                onPress={() => {
                  haptic.select();
                  onSelect(q.marketId);
                  sheet.dismiss();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${q.name}, ${km(q.distanceMeters)}, delivery ${formatNaira(q.deliveryFee)}`}
                className={`flex-row items-center gap-3.5 px-4 py-3.5 ${on ? "bg-brand-tint" : ""} ${i < quotes.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <View className={`h-12 w-12 items-center justify-center rounded-[14px] ${on ? "bg-brand" : tint.bg}`}>
                  {on ? <Check size={22} color={colors.onBrand} weight="bold" /> : <Storefront size={24} color={colors[tint.ink]} />}
                </View>
                <View className="flex-1 gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {q.name}
                    </Text>
                    {i === 0 ? <CheapestTag /> : null}
                  </View>
                  <Text variant="small" tone="faint">
                    {km(q.distanceMeters)} · open {formatMinutes(q.opensAtMin)}–{formatMinutes(q.closesAtMin)}
                  </Text>
                </View>
                <View className="items-end">
                  <Text variant="bodyStrong" tabular style={{ fontSize: 15 }}>
                    {formatNaira(q.deliveryFee)}
                  </Text>
                  <Text variant="caption" tone="faint">
                    delivery
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}

export function CheapestTag() {
  return (
    <View className="rounded-md bg-brand-tint px-1.5 py-0.5">
      <Text variant="caption" tone="inherit" className="uppercase text-brand-pressed" style={{ fontSize: 11, letterSpacing: 0.3 }}>
        Cheapest
      </Text>
    </View>
  );
}
