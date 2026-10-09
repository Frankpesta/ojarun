import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import { formatLagosClock, formatNaira } from "@ojarun/shared";
import { Pressable, Text, useToast } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { CountdownRing, useSecondsLeft } from "./Countdown";

type Chat = NonNullable<FunctionReturnType<typeof api.chat.list>>;
export type ChatMessage = Chat["messages"][number];
export type PriceCheck = NonNullable<ChatMessage["priceCheck"]>;

const STATE_LINE = {
  approved: (pc: PriceCheck) => `Approved · ${formatNaira(pc.extraRequested)} more`,
  buy_within_budget: (pc: PriceCheck) => `Buying within the ${formatNaira(pc.budget)} budget`,
  timed_out: (pc: PriceCheck) => `No answer · buying within ${formatNaira(pc.budget)}`,
} as const;

/**
 * A price check in the chat (05 §6.3), in pepper orange while it waits. The customer answers
 * here; approving opens the approve sheet, which shows where the money comes from.
 */
export function PriceCheckCard({
  message,
  side,
  totalSec,
  otherName,
  bufferLeft,
  onApprove,
}: {
  message: ChatMessage;
  side: "customer" | "shopper" | "ops";
  totalSec: number;
  otherName: string;
  bufferLeft: number;
  onApprove: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const respond = useMutation(api.priceChecks.respond);
  const [busy, setBusy] = useState(false);
  const pc = message.priceCheck!;
  const left = useSecondsLeft(pc.expiresAt);
  const live = pc.state === "pending" && left > 0;
  const mine = message.mine;

  const keep = async () => {
    setBusy(true);
    try {
      await respond({ messageId: message._id, decision: "within_budget" });
      haptic.select();
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      className={`gap-2.5 bg-surface p-3.5 ${mine ? "self-end" : "self-start"}`}
      style={{
        width: 300,
        borderWidth: 2,
        borderColor: live ? colors.accent : colors.line,
        borderRadius: 18,
        borderBottomRightRadius: mine ? 6 : 18,
        borderBottomLeftRadius: mine ? 18 : 6,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="caption" tone={live ? "accent" : "muted"} className="font-extrabold uppercase" style={{ letterSpacing: 0.4 }}>
          Price check · {pc.itemName}
        </Text>
        {live ? <CountdownRing expiresAt={pc.expiresAt} totalSec={totalSec} /> : null}
      </View>
      <Text variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
        Budget {formatNaira(pc.budget)}. Today it's{" "}
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          {formatNaira(pc.quoted)}
        </Text>
        . {formatNaira(pc.budget)} gets {pc.budgetGets}.
      </Text>

      {!live ? (
        <Text variant="smallStrong" tone={pc.state === "approved" ? "brand" : "muted"}>
          {pc.state === "pending" ? STATE_LINE.timed_out(pc) : STATE_LINE[pc.state](pc)}
        </Text>
      ) : side === "customer" ? (
        <>
          <Text variant="small" tone="muted">
            {formatNaira(pc.extraRequested)} more ·{" "}
            {bufferLeft >= pc.extraRequested ? "from your buffer" : bufferLeft > 0 ? `from your buffer (${formatNaira(bufferLeft)} left) and wallet` : "from your wallet"}
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => void keep()}
              disabled={busy}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-input border-[1.5px] border-line-strong"
              style={{ height: 46 }}
            >
              <Text variant="smallStrong">Keep {formatNaira(pc.budget)}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.select();
                onApprove();
              }}
              disabled={busy}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-input bg-accent-strong"
              style={{ height: 46 }}
            >
              <Text variant="smallStrong" tone="onBrand" className="font-extrabold">
                Pay {formatNaira(pc.extraRequested)} more
              </Text>
            </Pressable>
          </View>
          <Text variant="caption" tone="faint">
            No answer by {formatLagosClock(pc.expiresAt)}? {otherName} buys within your budget.
          </Text>
        </>
      ) : (
        <Text variant="smallStrong" tone="muted">
          Asked for {formatNaira(pc.extraRequested)} more · waiting for {otherName}
        </Text>
      )}
    </View>
  );
}
