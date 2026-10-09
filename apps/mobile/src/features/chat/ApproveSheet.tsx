import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import { formatNaira } from "@ojarun/shared";
import { Button, HoldToConfirm, Sheet, Sticker, Text, stickerFor, useToast, type SheetController } from "@/components";
import { FallbackTile } from "@/features/list/ItemSheet";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/telemetry";
import { CountdownRing } from "./Countdown";
import type { ChatMessage } from "./PriceCheckCard";

/**
 * "Pay ₦800 more?" (05 §6.3 step 2): where the extra comes from (leftover buffer, then wallet),
 * and a hold to approve, since it moves money. Approve is off when there isn't enough.
 */
export function ApproveSheet({
  sheet,
  message,
  totalSec,
  shopperName,
  bufferLeft,
  walletBalance,
}: {
  sheet: SheetController;
  message: ChatMessage | null;
  totalSec: number;
  shopperName: string;
  bufferLeft: number;
  walletBalance: number;
}) {
  const toast = useToast();
  const respond = useMutation(api.priceChecks.respond);
  const [busy, setBusy] = useState(false);
  const pc = message?.priceCheck;

  if (!message || !pc) {
    return (
      <Sheet sheet={sheet} title=" ">
        {null}
      </Sheet>
    );
  }

  const extra = pc.extraRequested;
  const fromBuffer = Math.min(extra, bufferLeft);
  const fromWallet = extra - fromBuffer;
  const available = bufferLeft + walletBalance;
  const enough = available >= extra;
  const kind = stickerFor(pc.itemName);

  const answer = async (decision: "approve" | "within_budget") => {
    setBusy(true);
    try {
      const state = await respond({ messageId: message._id, decision });
      track("price_check_responded", { decision, state, extra });
      if (state === "timed_out") toast.show({ message: `Time ran out, so ${shopperName} is buying within your budget.` });
      else if (decision === "approve") haptic.success();
      sheet.dismiss();
    } catch (e) {
      haptic.error();
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      sheet={sheet}
      variant="critical"
      title={`Pay ${formatNaira(extra)} more?`}
      subtitle={`${pc.itemName} goes from ${formatNaira(pc.budget)} to ${formatNaira(pc.budget + extra)}`}
      leading={kind ? <Sticker kind={kind} size={56} /> : <FallbackTile size={56} />}
    >
      <View className="gap-[18px]">
        <View className="self-end" style={{ marginTop: -8 }}>
          <CountdownRing expiresAt={pc.expiresAt} totalSec={totalSec} size={28} />
        </View>
        <View className="rounded-[18px] bg-surface-sunken px-4 py-1">
          {(
            [
              ["From your buffer", fromBuffer],
              ["From your wallet", fromWallet],
              ["Wallet after", Math.max(0, walletBalance - fromWallet)],
            ] as const
          ).map(([label, value], i) => (
            <View key={label} className={`flex-row justify-between py-3 ${i < 2 ? "border-b border-line" : ""}`}>
              <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
                {label}
              </Text>
              <Text variant="bodyStrong" tabular style={{ fontSize: 15 }}>
                {formatNaira(value)}
              </Text>
            </View>
          ))}
        </View>
        <Text variant="small" tone="muted">
          Whatever {shopperName} doesn't spend comes back to your wallet after delivery.
        </Text>
        <View className="gap-2">
          <HoldToConfirm
            size="lg"
            tone="pepper"
            label={enough ? `Hold to approve ${formatNaira(extra)}` : `You have ${formatNaira(available)} available`}
            accessibleLabel={enough ? `Approve ${formatNaira(extra)} extra for ${pc.itemName}` : undefined}
            disabled={!enough}
            loading={busy}
            onConfirm={() => void answer("approve")}
          />
          <Button label={`Keep the ${formatNaira(pc.budget)} budget`} variant="ghost" disabled={busy} onPress={() => void answer("within_budget")} />
        </View>
      </View>
    </Sheet>
  );
}
