import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira } from "@ojarun/shared";
import { Button, HoldToConfirm, Sheet, Text, useToast, type SheetController } from "@/components";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/** "Cancel this order?" with the exact refund first (05 §6.4 step 4). Hold to cancel. */
export function CancelSheet({ sheet, orderId, shopperName }: { sheet: SheetController; orderId: Id<"orders">; shopperName: string | null }) {
  const { colors } = useTheme();
  const toast = useToast();
  const quote = useQuery(api.orders.cancelQuote, { orderId });
  const cancel = useMutation(api.orders.cancel);
  const [busy, setBusy] = useState(false);

  const onCancel = async () => {
    setBusy(true);
    try {
      const { refund } = await cancel({ orderId });
      haptic.success();
      sheet.dismiss();
      toast.show({ message: refund > 0 ? `Order cancelled. ${formatNaira(refund)} is in your wallet.` : "Order cancelled." });
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const paid = quote?.cancellable ? quote.refund + quote.keptCharge : 0;
  return (
    <Sheet
      sheet={sheet}
      variant="critical"
      title="Cancel this order?"
      subtitle={
        quote?.cancellable === false
          ? "Shopping has started, so this order can't be cancelled."
          : quote?.unpaid
            ? "You haven't paid yet, so nothing is charged."
            : `${shopperName ?? "Your shopper"} hasn't started shopping, so you can still cancel. Your refund goes to your wallet.`
      }
    >
      {quote === undefined ? (
        <View className="items-center py-6">
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !quote || !quote.cancellable ? (
        <Button label="Close" variant="secondary" onPress={() => sheet.dismiss()} />
      ) : (
        <View className="gap-[18px]">
          {quote.refund > 0 ? (
            <View className="rounded-[18px] bg-surface-sunken px-4 py-1">
              {!quote.unpaid ? <Row label="You paid" value={formatNaira(paid)} /> : null}
              {quote.keptCharge > 0 ? <Row label="Paystack charge (kept)" value={`−${formatNaira(quote.keptCharge)}`} /> : null}
              <View className="flex-row justify-between py-3">
                <Text variant="bodyStrong" className="font-extrabold">
                  Back to your wallet
                </Text>
                <Text variant="bodyStrong" tone="brand" tabular className="font-extrabold">
                  {formatNaira(quote.refund)}
                </Text>
              </View>
            </View>
          ) : null}
          <View className="gap-1">
            <HoldToConfirm size="lg" tone="danger" label="Hold to cancel order" loading={busy} onConfirm={() => void onCancel()} />
            <Button label="Keep my order" variant="ghost" onPress={() => sheet.dismiss()} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between border-b border-line py-3">
      <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
        {label}
      </Text>
      <Text variant="bodyStrong" tabular style={{ fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}
