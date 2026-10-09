import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { completionCredits, formatNaira } from "@ojarun/shared";
import { BackButton, HoldToConfirm, Pressable, Skeleton, Sticker, Text, stickerFor, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { RejectSheet } from "@/features/door/RejectSheet";
import { FallbackTile } from "@/features/list/ItemSheet";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Inspect = NonNullable<FunctionReturnType<typeof api.delivery.inspect>>;
type Item = Inspect["items"][number];

export default function DoorScreen() {
  return (
    <RoleGuard role="customer">
      <Door />
    </RoleGuard>
  );
}

/**
 * Check your items at the door (05 §6.4, approved "Check and accept" frame): keep or reject each
 * item, see what comes back to the wallet, then hold to accept. Accepting is final.
 */
function Door() {
  const toast = useToast();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = orderId as Id<"orders">;
  const data = useQuery(api.delivery.inspect, orderId ? { orderId: id } : "skip");
  const undo = useMutation(api.delivery.undoReject);
  const accept = useMutation(api.delivery.accept);
  const rejectSheet = useSheet();
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (data?.status === "completed" && !done) setDone(true);
  }, [data?.status, done]);

  if (data === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={80} />
        <Skeleton height={320} />
      </SafeAreaView>
    );
  }
  if (data === null) return <Redirect href="/orders" />;
  if (done || data.status === "completed") return <Redirect href={{ pathname: "/receipt/[orderId]", params: { orderId: id } }} />;

  const atDoor = data.status === "arrived";
  const credits = completionCredits(data.items, { buffer: data.buffer, bufferUsed: data.bufferUsed });
  const rejected = data.items.filter((i) => i.status === "rejected");

  const onAccept = async () => {
    setAccepting(true);
    try {
      await accept({ orderId: id });
      haptic.success();
      router.replace({ pathname: "/receipt/[orderId]", params: { orderId: id } });
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView contentContainerClassName="gap-[18px] px-gutter pb-6" showsVerticalScrollIndicator={false}>
          <BackButton />
          <View className="gap-2">
            <View className={`flex-row items-center gap-2 self-start rounded-full px-3 py-1.5 ${atDoor ? "bg-brand-tint" : "bg-surface-sunken"}`}>
              <View className={`rounded-full ${atDoor ? "bg-brand" : "bg-ink-faint"}`} style={{ width: 8, height: 8 }} />
              <Text variant="smallStrong" tone={atDoor ? "brand" : "muted"} className="font-extrabold">
                {atDoor ? `${data.shopperName} is at your gate` : `${data.shopperName} isn't at your door yet`}
              </Text>
            </View>
            <Text variant="title" accessibilityRole="header" style={{ fontSize: 30, lineHeight: 36 }}>
              Check your items
            </Text>
            <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
              Reject anything that isn't right. {data.shopperName} takes it back and you're refunded to your wallet.
            </Text>
          </View>

          <View className="gap-2.5">
            {data.items.map((item) => (
              <ItemRow
                key={item._id}
                item={item}
                disabled={!atDoor}
                onReject={() => {
                  setRejecting(item);
                  rejectSheet.present();
                }}
                onKeep={() =>
                  void undo({ itemId: item._id })
                    .then(() => haptic.select())
                    .catch((e) => toast.show({ message: friendlyError(e), tone: "error" }))
                }
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} className="gap-3.5 rounded-t-[26px] border-t border-line bg-surface px-5 pt-[18px]" style={{ shadowColor: "#3C2D14", shadowOpacity: 0.08, shadowRadius: 30, elevation: 12 }}>
        <View className="gap-2">
          <Row label="Change and unused buffer" value={credits.leftover} />
          {credits.rejection > 0 ? <Row label={`Refund for rejected ${rejected.length === 1 ? rejected[0]!.name.toLowerCase() : "items"}`} value={credits.rejection} /> : null}
          <View className="flex-row justify-between">
            <Text variant="bodyStrong" className="font-extrabold">
              Back to your wallet
            </Text>
            <Text variant="bodyStrong" tone="brand" tabular className="font-extrabold">
              {formatNaira(credits.leftover + credits.rejection)}
            </Text>
          </View>
        </View>
        <HoldToConfirm size="lg" label="Hold to accept delivery" disabled={!atDoor} loading={accepting} onConfirm={() => void onAccept()} />
        <Text variant="caption" tone="faint" className="pb-2 text-center">
          Accepting is final. Items can't be returned after this.
        </Text>
      </SafeAreaView>

      <RejectSheet sheet={rejectSheet} item={rejecting} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-row justify-between">
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text variant="smallStrong" tabular>
        {formatNaira(value)}
      </Text>
    </View>
  );
}

function ItemRow({ item, disabled, onReject, onKeep }: { item: Item; disabled: boolean; onReject: () => void; onKeep: () => void }) {
  const { colors } = useTheme();
  const kind = stickerFor(item.name);
  const isRejected = item.status === "rejected";
  const decidable = item.status === "bought" || item.status === "adjusted" || isRejected;
  const funded = item.budget + item.approvedExtra;
  const detail =
    item.status === "skipped"
      ? `Not available${item.shopperNote ? ` · ${item.shopperNote}` : ""} · ${formatNaira(funded)} back`
      : isRejected
        ? `Rejected · ${item.rejectionReason ?? ""}`
        : `Spent ${formatNaira(item.amountSpent)} of ${formatNaira(funded)}${item.quantityNote ? ` · ${item.quantityNote}` : ""}`;
  return (
    <View
      className="flex-row items-center gap-3 rounded-[18px] bg-surface p-3"
      style={{ borderWidth: isRejected ? 2 : 1, borderColor: isRejected ? colors.error : colors.line }}
    >
      {item.photoUrl ? (
        <Image source={{ uri: item.photoUrl }} style={{ width: 56, height: 56, borderRadius: 14 }} contentFit="cover" accessibilityLabel={`Photo of ${item.name}`} />
      ) : kind ? (
        <Sticker kind={kind} size={56} />
      ) : (
        <FallbackTile size={56} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="small" tone={isRejected ? "error" : "faint"} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      {decidable ? (
        <View className="flex-row rounded-xl bg-surface-sunken p-[3px]" accessibilityRole="radiogroup" accessibilityLabel={`Keep or reject ${item.name}`}>
          <Pressable
            scale={false}
            disabled={disabled || !isRejected}
            onPress={onKeep}
            accessibilityRole="radio"
            accessibilityState={{ checked: !isRejected, disabled }}
            className={`justify-center rounded-[10px] px-2.5 ${!isRejected ? "bg-surface" : ""}`}
            style={{ height: 36 }}
          >
            <Text variant="caption" tone={!isRejected ? "brand" : "muted"} className="font-extrabold">
              Keep
            </Text>
          </Pressable>
          <Pressable
            scale={false}
            disabled={disabled || isRejected}
            onPress={onReject}
            accessibilityRole="radio"
            accessibilityState={{ checked: isRejected, disabled }}
            className={`justify-center rounded-[10px] px-2.5 ${isRejected ? "bg-error" : ""}`}
            style={{ height: 36 }}
          >
            <Text variant="caption" tone={isRejected ? "onBrand" : "muted"} className="font-extrabold">
              Reject
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
