import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira } from "@ojarun/shared";
import { Button, Chip, Input, Sheet, Sticker, Text, stickerFor, useToast, type SheetController } from "@/components";
import { FallbackTile } from "@/features/list/ItemSheet";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { track } from "@/lib/telemetry";

const REASONS = ["Too soft or spoilt", "Wrong item", "Too small", "Not what I asked", "Something else"] as const;

/** "What's wrong with it?" (05 §6.4 step 2). A reason is required; a note is optional. */
export function RejectSheet({
  sheet,
  item,
}: {
  sheet: SheetController;
  item: { _id: Id<"orderItems">; name: string; amountSpent: number } | null;
}) {
  const toast = useToast();
  const reject = useMutation(api.delivery.rejectItem);
  const [reason, setReason] = useState<(typeof REASONS)[number] | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setReason(null);
    setNote("");
  };
  if (!item) {
    return (
      <Sheet sheet={sheet} title=" ">
        {null}
      </Sheet>
    );
  }

  const full = reason === "Something else" ? note.trim() : [reason, note.trim()].filter(Boolean).join(": ");
  const ready = !!reason && full.length >= 3;
  const save = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await reject({ itemId: item._id, reason: full });
      track("item_rejected", { reason: reason ?? "other", amount: item.amountSpent });
      haptic.warning();
      sheet.dismiss();
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const kind = stickerFor(item.name);
  return (
    <Sheet
      sheet={sheet}
      variant="form"
      title="What's wrong with it?"
      subtitle={`${item.name}${item.amountSpent ? ` · ${formatNaira(item.amountSpent)} back to your wallet` : ""}`}
      leading={kind ? <Sticker kind={kind} size={56} /> : <FallbackTile size={56} />}
      dirty={!!reason || note.length > 0}
      onDismiss={reset}
      footer={
        <>
          <Button label={`Reject ${item.name.toLowerCase()}`} variant="danger" size="lg" loading={saving} disabled={!ready} onPress={() => void save()} />
          <Text variant="small" tone="muted" className="text-center">
            You can change your mind until you accept the delivery.
          </Text>
        </>
      }
    >
      <View className="gap-[18px]">
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel="Reason">
          {REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Input
          label={reason === "Something else" ? "Tell us what's wrong" : "Add a note (optional)"}
          inSheet
          value={note}
          onChangeText={setNote}
          placeholder="e.g. They'll be rotten by tomorrow"
          maxLength={150}
        />
      </View>
    </Sheet>
  );
}
