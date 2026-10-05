import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { ArrowDown, ArrowUp, Bank, ClockCounterClockwise, Plus } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatNaira, lagosDate, formatLagosDay } from "@ojarun/shared";
import { Button, DelayedSkeleton, Pressable, Screen, Skeleton, Text, useToast } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { useTheme } from "@/theme/ThemeProvider";

const ENTRY_TITLE: Record<string, string> = {
  leftover_credit: "Change from your order",
  rejection_credit: "Refund for a rejected item",
  cancellation_refund: "Refund for a cancelled order",
  checkout_debit: "Used on an order",
  price_check_debit: "Extra for a price check",
  withdrawal_debit: "Withdrawal to your bank",
  withdrawal_reversal: "Withdrawal returned",
  adjustment: "Adjustment by OjaRun",
};

export default function CustomerWallet() {
  const me = useMe();
  const { colors } = useTheme();
  const toast = useToast();
  const balance = me?.walletBalance ?? 0;

  return (
    <Screen title="Wallet" tabs>
      <View className="gap-[22px]">
        <View className="gap-[18px] overflow-hidden rounded-[26px] bg-forest p-[22px]">
          <View
            className="absolute rounded-full border-[28px]"
            style={{ right: -60, top: -60, width: 200, height: 200, borderColor: "rgba(74,222,128,0.10)" }}
          />
          <View className="gap-1.5">
            <Text variant="smallStrong" tone="forestMuted">
              Available balance
            </Text>
            <Text
              variant="display"
              tone="onForest"
              tabular
              style={{ fontSize: 42, lineHeight: 46, letterSpacing: -1.2 }}
              accessibilityLabel={`Balance ${formatNaira(balance)}`}
            >
              {formatNaira(balance)}
            </Text>
            <Text variant="small" tone="onForestSoft">
              Change and refunds land here. Spend it on your next order or withdraw it.
            </Text>
          </View>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button
                label="Withdraw"
                variant="onForest"
                icon={ArrowUp}
                disabled={balance <= 0}
                onPress={() => toast.show({ message: "Withdrawals open with your first completed order." })}
              />
            </View>
            <View className="flex-1">
              <Button label="Start a list" variant="glass" icon={Plus} onPress={() => router.push("/home")} />
            </View>
          </View>
        </View>

        <Pressable
          scale={false}
          onPress={() => toast.show({ message: "You'll add your bank when you first withdraw." })}
          accessibilityRole="button"
          accessibilityLabel="Bank account for withdrawals. Not added yet"
          className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5"
        >
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-warning-tint">
            <Bank size={22} color={colors.warningInk} weight="bold" />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>
              Bank account
            </Text>
            <Text variant="small" tone="faint">
              Withdrawals go here. Not added yet
            </Text>
          </View>
        </Pressable>

        <Activity />
      </View>
    </Screen>
  );
}

function Activity() {
  const { colors } = useTheme();
  const rows = useQuery(api.wallet.activity);
  const now = Date.now();

  return (
    <View className="gap-3">
      <Text variant="heading" accessibilityRole="header">
        Activity
      </Text>
      {rows === undefined ? (
        <DelayedSkeleton>
          <View className="gap-3 rounded-card border border-line bg-surface p-4">
            <Skeleton height={40} />
            <Skeleton height={40} />
          </View>
        </DelayedSkeleton>
      ) : rows.length === 0 ? (
        <View className="items-center gap-2 rounded-card border border-line bg-surface px-6 py-8">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-sunken">
            <ClockCounterClockwise size={24} color={colors.inkFaint} />
          </View>
          <Text variant="bodyStrong">Nothing here yet</Text>
          <Text variant="small" tone="muted" className="text-center">
            When a shopper spends less than your budget, the change shows up here.
          </Text>
        </View>
      ) : (
        <View className="rounded-card border border-line bg-surface">
          {rows.map((r, i) => {
            const credit = r.amount > 0;
            const Icon = credit ? ArrowDown : ArrowUp;
            const day = formatLagosDay(lagosDate(r._creationTime), now);
            return (
              <View
                key={r._id}
                accessible
                className={`flex-row items-center gap-3 px-4 py-3.5 ${i < rows.length - 1 ? "border-b border-line-soft" : ""}`}
              >
                <View className={`h-10 w-10 items-center justify-center rounded-full ${credit ? "bg-brand-tint" : "bg-surface-sunken"}`}>
                  <Icon size={18} color={credit ? colors.brand : colors.inkMuted} weight="bold" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                    {ENTRY_TITLE[r.type] ?? "Wallet update"}
                  </Text>
                  <Text variant="small" tone="faint" numberOfLines={1}>
                    {r.note ? `${day} · ${r.note}` : day}
                  </Text>
                </View>
                <Text variant="bodyStrong" tabular tone="inherit" style={{ fontSize: 15, color: credit ? colors.brandPressed : colors.ink }}>
                  {credit ? "+" : "−"}
                  {formatNaira(Math.abs(r.amount))}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
