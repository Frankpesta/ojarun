import { useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira } from "@ojarun/shared";
import { Button, Input, MoneyInput, Pressable, Sheet, Sticker, Text, stickerFor, useToast, type SheetController } from "@/components";
import { FallbackTile } from "@/features/list/ItemSheet";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/telemetry";

/**
 * "Ask Funmi for more" (05 §6.3 step 1): today's price, what the budget gets instead, and the
 * extra (filled in as price − budget). The customer has a few minutes to answer in chat.
 */
export function PriceCheckSheet({
  sheet,
  item,
  customerName,
  timeoutMin,
}: {
  sheet: SheetController;
  item: { _id: Id<"orderItems">; name: string; budget: number; approvedExtra: number };
  customerName: string;
  timeoutMin: number;
}) {
  const toast = useToast();
  const send = useMutation(api.priceChecks.send);
  const cap = item.budget + item.approvedExtra;
  const [quoted, setQuoted] = useState<number | null>(null);
  const [gets, setGets] = useState("");
  const [customExtra, setCustomExtra] = useState<number | null>(null);
  const [editingExtra, setEditingExtra] = useState(false);
  const [sending, setSending] = useState(false);
  const [requestId, setRequestId] = useState(() => randomUUID());

  const gap = quoted !== null ? quoted - cap : 0;
  const extra = editingExtra ? customExtra : gap > 0 ? gap : null;
  const reset = () => {
    setQuoted(null);
    setGets("");
    setCustomExtra(null);
    setEditingExtra(false);
    setRequestId(randomUUID());
  };

  const blocker =
    quoted === null
      ? "Enter today's price"
      : gap <= 0
        ? `That's within the ${formatNaira(cap)} budget. Just buy it.`
        : gets.trim().length < 3
          ? `Say what ${formatNaira(cap)} gets instead`
          : !extra || extra <= 0
            ? "Enter the extra to ask for"
            : extra > gap
              ? `Ask for at most ${formatNaira(gap)}`
              : null;

  const submit = async () => {
    if (blocker || !quoted || !extra) return;
    setSending(true);
    try {
      await send({ clientRequestId: requestId, itemId: item._id, quoted, budgetGets: gets.trim(), extraRequested: extra });
      haptic.success();
      track("price_check_sent", { extra, overBudgetPct: Math.round((gap / cap) * 100) });
      toast.show({ message: `Sent. ${customerName} has ${timeoutMin} minutes to answer.` });
      sheet.dismiss();
    } catch (e) {
      haptic.error();
      toast.show({ message: friendlyError(e, "Couldn't send. Check your signal and try again."), tone: "error" });
    } finally {
      setSending(false);
    }
  };

  const kind = stickerFor(item.name);
  return (
    <Sheet
      sheet={sheet}
      variant="form"
      title={`Ask ${customerName} for more`}
      subtitle={`${item.name} · budget ${formatNaira(cap)}`}
      leading={kind ? <Sticker kind={kind} size={48} /> : <FallbackTile size={48} />}
      dirty={quoted !== null || gets.length > 0}
      onDismiss={reset}
      footer={
        <>
          <Button label="Send price check" size="lg" loading={sending} disabled={!!blocker} onPress={() => void submit()} />
          <Text variant="small" tone="muted" className="text-center">
            {blocker && quoted !== null ? blocker : `If ${customerName} doesn't answer in ${timeoutMin} minutes, buy ${formatNaira(cap)} worth.`}
          </Text>
        </>
      }
    >
      <View className="gap-4">
        <MoneyInput label={`Today's price for what ${customerName} asked`} inSheet value={quoted} onChange={setQuoted} quickAmounts={[]} />
        <Input
          label={`What ${formatNaira(cap)} gets instead`}
          inSheet
          value={gets}
          onChangeText={setGets}
          placeholder="e.g. about 1½ paint rubbers"
          maxLength={140}
        />
        {editingExtra ? (
          <MoneyInput label="Extra to ask for" inSheet value={customExtra} onChange={setCustomExtra} quickAmounts={[]} hint={gap > 0 ? `Up to ${formatNaira(gap)}` : undefined} />
        ) : extra ? (
          <View className="flex-row items-center justify-between rounded-card bg-accent-tint p-3.5">
            <View>
              <Text variant="smallStrong" tone="accent">
                Extra to ask for
              </Text>
              <Text variant="heading" tabular>
                {formatNaira(extra)}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setCustomExtra(extra);
                setEditingExtra(true);
              }}
              accessibilityRole="button"
              className="items-center justify-center rounded-full bg-surface px-3.5"
              style={{ height: 40 }}
            >
              <Text variant="smallStrong">Change</Text>
            </Pressable>
          </View>
        ) : null}
        {quoted && gap > 0 && gets.trim().length >= 3 ? (
          <View className="gap-1.5">
            <Text variant="smallStrong" tone="muted">
              {customerName} will see
            </Text>
            <View className="rounded-card border-2 border-accent px-3.5 py-3">
              <Text variant="small" style={{ fontSize: 14, lineHeight: 20 }}>
                Budget {formatNaira(cap)}. Today it's <Text variant="smallStrong">{formatNaira(quoted)}</Text>. {formatNaira(cap)} gets {gets.trim()}.
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
