import { View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { useNetInfo } from "@react-native-community/netinfo";
import { Check, Clock, Money, Prohibit, X } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatLagosTime, formatNaira } from "@ojarun/shared";
import { Button, Text } from "@/components";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { useUploadQueue, type QueuedPayment } from "./useUploadQueue";
import type { Id } from "@ojarun/convex/dataModel";

type ForItem = NonNullable<FunctionReturnType<typeof api.transfers.forItem>>;
type Tone = "done" | "waiting" | "failed";

/** Paid (confirmed), sending (server or still on the phone) and what's left to pay. */
export function paymentTotals(server: ForItem | null | undefined, queued: readonly QueuedPayment[], cap: number, fallbackSpent = 0) {
  const paid = server?.spent ?? fallbackSpent;
  const serverSending = (server?.transfers ?? []).filter((t) => t.status === "queued" || t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const sending = serverSending + queued.filter((j) => j.status !== "failed").reduce((s, j) => s + j.amount, 0);
  return { paid, sending, left: Math.max(0, cap - paid - sending) };
}

/**
 * The money on one item: paid, on its way, and what's left, then every payment with its
 * state. Queued payments show before the server has them, so nothing looks lost offline.
 */
export function PaymentsCard({
  batchId,
  itemId,
  itemName,
  cap,
  server,
  queued,
}: {
  batchId: Id<"batches">;
  itemId: Id<"orderItems">;
  itemName: string;
  cap: number;
  server: ForItem | null | undefined;
  queued: QueuedPayment[];
}) {
  const { colors } = useTheme();
  const { isConnected } = useNetInfo();
  const enqueue = useUploadQueue((s) => s.enqueue);

  const transfers = server?.transfers ?? [];
  const cash = server?.cash ?? [];
  const { paid, sending, left } = paymentTotals(server, queued, cap);
  const retrying = new Set(queued.flatMap((j) => (j.type === "retryTransfer" ? [j.transferId] : [])));
  const blocked = transfers.some((t) => t.status === "blocked");

  type Row = { key: string; name: string; detail: string; amount: number; tone: Tone; cash?: boolean; retry?: () => void };
  const rows: Row[] = [
    ...queued.map<Row>((j) => ({
      key: j.id,
      name: j.type === "cashSpend" ? (j.traderLabel ?? "Cash") : j.traderName,
      detail: j.status === "failed" ? `Didn't send: ${j.lastError ?? "see Uploads"}` : isConnected === false ? "Waiting for signal" : "Sending…",
      amount: j.amount,
      tone: j.status === "failed" ? "failed" : "waiting",
      cash: j.type === "cashSpend",
    })),
    ...transfers
      .filter((t) => t.status !== "blocked")
      .map<Row>((t) => ({
        key: t._id,
        name: t.traderName,
        detail:
          t.status === "success"
            ? `Bank transfer · paid ${formatLagosTime(t.at)}`
            : t.status === "failed"
              ? (t.failureReason ?? "Didn't go through.") + " No money left you."
              : t.status === "reversed"
                ? "The bank sent it back. Call ops."
                : "Sending · waiting for the bank",
        amount: t.amount,
        tone: t.status === "success" ? "done" : t.status === "queued" || t.status === "pending" ? "waiting" : "failed",
        retry:
          t.canRetry && !retrying.has(t._id)
            ? () => {
                haptic.select();
                enqueue(batchId, { type: "retryTransfer", transferId: t._id, itemId, itemName, traderName: t.traderName, amount: t.amount });
              }
            : undefined,
      })),
    ...cash.map<Row>((c) => ({
      key: c._id,
      name: c.traderLabel ?? "Cash",
      detail: `Cash · ${formatLagosTime(c.at)}`,
      amount: c.amount,
      tone: "done",
      cash: true,
    })),
  ];

  if (rows.length === 0 && !blocked) return null;
  const paidPct = cap > 0 ? Math.min(1, paid / cap) : 0;
  const sendingPct = cap > 0 ? Math.min(1 - paidPct, sending / cap) : 0;

  return (
    <View className="gap-[18px]">
      <View className="gap-3 rounded-[22px] bg-forest p-[18px]" accessible accessibilityLabel={`${formatNaira(paid)} paid of ${formatNaira(cap)}${sending ? `, ${formatNaira(sending)} sending` : ""}. ${formatNaira(left)} left.`}>
        <View className="flex-row items-baseline justify-between">
          <Text variant="smallStrong" tone="onForestSoft">
            Paid
          </Text>
          <Text variant="small" tone="onForestSoft" tabular>
            of {formatNaira(cap)}
          </Text>
        </View>
        <Text variant="title" tone="onForest" tabular style={{ fontSize: 32, lineHeight: 38 }}>
          {formatNaira(paid)}
          {sending ? (
            <Text variant="bodyStrong" tone="inherit" style={{ color: colors.warning }}>
              {"  "}+ {formatNaira(sending)} sending
            </Text>
          ) : null}
        </Text>
        <View className="h-2.5 flex-row overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.14)" }}>
          <View style={{ width: `${paidPct * 100}%`, backgroundColor: colors.live }} />
          <View style={{ width: `${sendingPct * 100}%`, backgroundColor: colors.warning }} />
        </View>
        <Text variant="small" tone="onForestSoft" tabular>
          {left > 0 ? `${formatNaira(left)} left you can still pay` : "Budget used up"}
        </Text>
      </View>

      {rows.length ? (
        <View className="gap-2">
          <Text variant="smallStrong" tone="muted">
            Payments
          </Text>
          <View className="overflow-hidden rounded-[18px] border border-line bg-surface">
            {rows.map((r, i) => (
              <View key={r.key} className={`gap-2.5 p-3.5 ${r.tone === "failed" ? "bg-error-tint" : ""} ${i < rows.length - 1 ? "border-b border-line" : ""}`}>
                <View className="flex-row items-center gap-3">
                  <StatusDot tone={r.tone} cash={r.cash} />
                  <View className="flex-1">
                    <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text variant="small" tone={r.tone === "failed" ? "error" : r.tone === "waiting" ? "warningInk" : "muted"} numberOfLines={2}>
                      {r.detail}
                    </Text>
                  </View>
                  <Text
                    variant="bodyStrong"
                    tone={r.tone === "failed" ? "faint" : "ink"}
                    tabular
                    className="font-extrabold"
                    style={r.tone === "failed" ? { textDecorationLine: "line-through" } : undefined}
                  >
                    {formatNaira(r.amount)}
                  </Text>
                </View>
                {r.retry ? (
                  <View className="self-end">
                    <Button label="Try again" size="sm" onPress={r.retry} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {blocked ? (
        <View className="flex-row gap-3 rounded-[18px] border-[1.5px] border-error bg-surface p-3.5" accessibilityLiveRegion="polite">
          <Prohibit size={22} color={colors.error} weight="bold" />
          <View className="flex-1 gap-0.5">
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>
              A payment was blocked
            </Text>
            <Text variant="small" tone="muted">
              This account can't be paid from OjaRun. Ops has been told and will call you.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function StatusDot({ tone, cash }: { tone: Tone; cash?: boolean }) {
  const { colors } = useTheme();
  const bg = tone === "done" ? "bg-brand-tint" : tone === "waiting" ? "bg-warning-tint" : "bg-error-tint";
  const color = tone === "done" ? colors.brand : tone === "waiting" ? colors.warningInk : colors.error;
  return (
    <View className={`items-center justify-center rounded-full ${bg}`} style={{ width: 36, height: 36 }}>
      {tone === "failed" ? (
        <X size={18} color={color} weight="bold" />
      ) : tone === "waiting" ? (
        <Clock size={18} color={color} weight="bold" />
      ) : cash ? (
        <Money size={18} color={color} weight="bold" />
      ) : (
        <Check size={18} color={color} weight="bold" />
      )}
    </View>
  );
}
