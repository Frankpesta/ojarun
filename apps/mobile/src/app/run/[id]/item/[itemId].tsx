import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useQuery } from "convex/react";
import { useNetInfo } from "@react-native-community/netinfo";
import { Camera, ChatCircleDots } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatNaira } from "@ojarun/shared";
import { BackButton, Button, Input, Pressable, Skeleton, Sticker, Text, stickerFor, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { FallbackTile } from "@/features/list/ItemSheet";
import { CameraCapture } from "@/features/shopper/CameraCapture";
import { CountdownRing, useSecondsLeft } from "@/features/chat/Countdown";
import { PaySheet } from "@/features/shopper/PaySheet";
import { PriceCheckSheet } from "@/features/shopper/PriceCheckSheet";
import { PaymentsCard, paymentTotals } from "@/features/shopper/Payments";
import { OrderBadge } from "@/features/shopper/orderBadge";
import { deleteQueuedPhoto, prepareItemPhoto } from "@/features/shopper/photos";
import { queuedOutcome, queuedPayments, queuedPhoto, useUploadQueue, type ItemOutcome } from "@/features/shopper/useUploadQueue";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function ItemScreen() {
  return (
    <RoleGuard role="shopper">
      <ShopItem />
    </RoleGuard>
  );
}

const OUTCOMES: { value: ItemOutcome; label: string }[] = [
  { value: "bought", label: "Bought" },
  { value: "adjusted", label: "Changed" },
  { value: "skipped", label: "Not there" },
];

function ShopItem() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const batchId = id as Id<"batches">;
  const batch = useQuery(api.shopper.batch, id ? { batchId } : "skip");
  const jobs = useUploadQueue((s) => s.jobs);

  if (batch === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={80} />
        <Skeleton height={180} />
      </SafeAreaView>
    );
  }
  const index = batch?.orders.findIndex((o) => o.items.some((i) => i._id === itemId)) ?? -1;
  const order = batch && index >= 0 ? batch.orders[index]! : null;
  const item = order?.items.find((i) => i._id === itemId);
  if (!batch || !order || !item) {
    return (
      <SafeAreaView className="flex-1 gap-3 bg-bg px-gutter">
        <BackButton />
        <Text variant="heading">This item isn't on your run</Text>
        <Text variant="body" tone="muted">
          Ops may have moved the order. Go back to see your list.
        </Text>
      </SafeAreaView>
    );
  }

  const queued = queuedOutcome(jobs, item._id);
  return (
    <ItemForm
      key={item._id}
      batchId={batchId}
      marketId={batch.market?._id ?? null}
      orderId={order._id}
      orderIndex={index}
      customerName={order.customer.firstName}
      orderCode={order.code}
      item={item}
      initial={{
        outcome: queued?.outcome ?? (item.status === "pending" || item.status === "rejected" ? null : item.status),
        quantityNote: queued?.quantityNote ?? item.quantityNote ?? "",
        shopperNote: queued?.shopperNote ?? item.shopperNote ?? "",
      }}
    />
  );
}

type ItemData = {
  _id: Id<"orderItems">;
  name: string;
  budget: number;
  approvedExtra: number;
  amountSpent: number;
  preferences: string[];
  note: string | null;
  photoUrl: string | null;
};

function ItemForm({
  batchId,
  marketId,
  orderId,
  orderIndex,
  customerName,
  orderCode,
  item,
  initial,
}: {
  batchId: Id<"batches">;
  marketId: Id<"markets"> | null;
  orderId: Id<"orders">;
  orderIndex: number;
  customerName: string;
  orderCode: string;
  item: ItemData;
  initial: { outcome: ItemOutcome | null; quantityNote: string; shopperNote: string };
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const { isConnected } = useNetInfo();
  const jobs = useUploadQueue((s) => s.jobs);
  const enqueue = useUploadQueue((s) => s.enqueue);

  const [outcome, setOutcome] = useState<ItemOutcome | null>(initial.outcome);
  const [quantityNote, setQuantityNote] = useState(initial.quantityNote);
  const [shopperNote, setShopperNote] = useState(initial.shopperNote);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  // A new photo taken on this visit: shrunk and on disk, queued only when the shopper saves.
  const [fresh, setFresh] = useState<{ jobId: string; uri: string } | null>(null);
  const saved = useRef(false);
  // The fresh photo joined the queue early, because a payment needed it before Save.
  const photoQueued = useRef(false);
  const paySheet = useSheet();
  const server = useQuery(api.transfers.forItem, { itemId: item._id });
  const latestCheck = useQuery(api.priceChecks.latestForItem, { itemId: item._id });
  const unread = useQuery(api.chat.unread, { orderId }) ?? 0;
  const settings = useQuery(api.settings.publicSettings);
  const checkSecondsLeft = useSecondsLeft(latestCheck?.state === "pending" ? latestCheck.expiresAt : null);
  const checkPending = latestCheck?.state === "pending" && checkSecondsLeft > 0;
  const pcSheet = useSheet();
  const timeoutSec = settings?.priceCheckTimeoutSec ?? 300;

  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  // Leaving without saving: drop the photo taken on this visit so it never uploads.
  useEffect(
    () => () => {
      if (!saved.current && !photoQueued.current && freshRef.current) deleteQueuedPhoto(freshRef.current.uri);
    },
    [],
  );

  const pendingPhoto = queuedPhoto(jobs, item._id);
  const photoUri = fresh?.uri ?? pendingPhoto?.fileUri ?? item.photoUrl;
  const funded = item.budget + item.approvedExtra;
  const queuedPay = queuedPayments(jobs, item._id);
  const totals = paymentTotals(server, queuedPay, funded, item.amountSpent);

  const queueFreshPhoto = () => {
    if (!fresh || photoQueued.current) return;
    enqueue(batchId, { type: "uploadPhoto", itemId: item._id, itemName: item.name, fileUri: fresh.uri }, fresh.jobId);
    photoQueued.current = true;
  };

  const onCaptured = async (raw: string) => {
    setCameraOpen(false);
    setProcessing(true);
    try {
      if (fresh && !photoQueued.current) deleteQueuedPhoto(fresh.uri);
      photoQueued.current = false;
      const jobId = randomUUID();
      setFresh({ jobId, uri: await prepareItemPhoto(raw, jobId) });
      haptic.success();
    } catch {
      toast.show({ message: "Couldn't save that photo. Try again.", tone: "error" });
    } finally {
      setProcessing(false);
    }
  };

  const needsPhoto = outcome === "bought" || outcome === "adjusted";
  const needsNote = outcome === "adjusted" || outcome === "skipped";
  const blocker = !outcome
    ? "Choose what happened"
    : needsPhoto && !photoUri
      ? "Take a photo of the item first"
      : needsNote && shopperNote.trim().length < 3
        ? outcome === "skipped"
          ? `Tell ${customerName} why it isn't there`
          : `Tell ${customerName} what you changed`
        : outcome === "skipped" && totals.paid + totals.sending > 0
          ? "Money was already paid for this item"
          : null;

  const save = () => {
    if (blocker || !outcome) return;
    queueFreshPhoto();
    enqueue(batchId, {
      type: "setOutcome",
      itemId: item._id,
      itemName: item.name,
      outcome,
      shopperNote: shopperNote.trim() || undefined,
      quantityNote: outcome === "skipped" ? undefined : quantityNote.trim() || undefined,
    });
    saved.current = true;
    haptic.success();
    if (isConnected === false) toast.show({ message: "Saved on your phone. It'll send when you're back online." });
    router.back();
  };

  const kind = stickerFor(item.name);
  const photoState = fresh ? null : pendingPhoto ? (isConnected === false ? "Waiting for signal" : "Sending…") : null;

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-[18px] px-gutter pb-8" showsVerticalScrollIndicator={false}>
          <View className="flex-row items-center justify-between pt-2">
            <BackButton />
            <Pressable
              onPress={() => router.push({ pathname: "/chat/[orderId]", params: { orderId } })}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${customerName}${unread ? `, ${unread} unread` : ""}`}
              className="flex-row items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3"
              style={{ minHeight: 44 }}
            >
              <OrderBadge index={orderIndex} size={24} />
              <Text variant="smallStrong">
                {customerName} · #{orderCode}
              </Text>
              <ChatCircleDots size={18} color={colors.brand} weight="bold" />
              {unread ? <View className="rounded-full bg-accent" style={{ width: 8, height: 8 }} /> : null}
            </Pressable>
          </View>

          <View className="flex-row items-center gap-3.5">
            {kind ? <Sticker kind={kind} size={64} /> : <FallbackTile size={64} />}
            <View className="flex-1 gap-0.5">
              <Text variant="title" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
                {item.name}
              </Text>
              <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
                Budget{" "}
                <Text variant="bodyStrong" tabular style={{ fontSize: 15 }}>
                  {formatNaira(funded)}
                </Text>
                {item.approvedExtra ? ` (incl. ${formatNaira(item.approvedExtra)} extra)` : ""}
              </Text>
            </View>
          </View>

          {item.preferences.length || item.note ? (
            <View className="gap-2.5 rounded-[18px] border border-line bg-surface p-3.5" accessible accessibilityLabel={`${customerName} wants: ${[...item.preferences, item.note].filter(Boolean).join(", ")}`}>
              {item.preferences.length ? (
                <View className="flex-row flex-wrap gap-1.5">
                  {item.preferences.map((p) => (
                    <View key={p} className="rounded-full bg-brand-tint px-3 py-1.5">
                      <Text variant="caption" tone="brand" className="font-bold">
                        {p}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {item.note ? (
                <Text variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
                  “{item.note}”
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="gap-2">
            <Text variant="smallStrong" tone="muted">
              Photo
            </Text>
            {photoUri ? (
              <View className="overflow-hidden rounded-[18px] bg-surface-sunken" style={{ height: 196 }}>
                <Image source={{ uri: photoUri }} style={{ flex: 1 }} contentFit="cover" transition={150} accessibilityLabel={`Photo of ${item.name}`} />
                {photoState ? (
                  <View className="absolute left-2.5 top-2.5 flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(26,23,20,0.7)" }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning }} />
                    <Text variant="caption" tone="inherit" style={{ color: "#FFFFFF" }}>
                      {photoState}
                    </Text>
                  </View>
                ) : null}
                <Pressable
                  onPress={() => setCameraOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Retake photo"
                  className="absolute bottom-2.5 right-2.5 flex-row items-center gap-1.5 rounded-full px-3.5"
                  style={{ height: 40, backgroundColor: "rgba(255,255,255,0.94)" }}
                >
                  <Camera size={16} color="#1A1714" weight="bold" />
                  <Text variant="smallStrong" tone="inherit" style={{ color: "#1A1714" }}>
                    Retake
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setCameraOpen(true)}
                disabled={processing}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                className="items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-line-strong bg-surface"
                style={{ height: 156 }}
              >
                <Camera size={30} color={colors.brand} weight="bold" />
                <Text variant="bodyStrong" tone="brand">
                  {processing ? "Saving photo…" : "Take a photo"}
                </Text>
                <Text variant="small" tone="faint">
                  {customerName} sees it straight away
                </Text>
              </Pressable>
            )}
          </View>

          <PaymentsCard batchId={batchId} itemId={item._id} itemName={item.name} cap={funded} server={server} queued={queuedPay} />
          {checkPending && latestCheck ? (
            <View className="flex-row items-center gap-3 rounded-card border-2 border-accent bg-surface p-3.5" accessibilityLiveRegion="polite">
              <CountdownRing expiresAt={latestCheck.expiresAt} totalSec={timeoutSec} size={28} showLabel={false} />
              <View className="flex-1">
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  Waiting for {customerName}
                </Text>
                <Text variant="small" tone="muted">
                  Asked for {formatNaira(latestCheck.extraRequested)} more. If no answer, buy {formatNaira(latestCheck.budget)} worth.
                </Text>
              </View>
            </View>
          ) : latestCheck && latestCheck.state !== "pending" && Date.now() - (latestCheck.respondedAt ?? 0) < 30 * 60_000 ? (
            <Text variant="smallStrong" tone={latestCheck.state === "approved" ? "brand" : "muted"}>
              {latestCheck.state === "approved"
                ? `${customerName} approved ${formatNaira(latestCheck.extraRequested)} more. You can pay up to ${formatNaira(funded)}.`
                : latestCheck.state === "timed_out"
                  ? `No answer from ${customerName}. Buy ${formatNaira(latestCheck.budget)} worth.`
                  : `${customerName} said keep to ${formatNaira(latestCheck.budget)}.`}
            </Text>
          ) : null}
          {outcome !== "skipped" ? (
            <Button
              label={totals.paid + totals.sending > 0 ? (totals.left > 0 ? `Pay another ${formatNaira(totals.left)}` : "Budget used up") : "Pay the trader"}
              variant={totals.paid + totals.sending > 0 ? "secondary" : "primary"}
              size="lg"
              disabled={!photoUri || totals.left <= 0}
              onPress={() => paySheet.present()}
            />
          ) : null}
          {outcome !== "skipped" && !checkPending ? (
            <Button label={`Costs more? Ask ${customerName}`} variant="ghost" onPress={() => pcSheet.present()} />
          ) : null}

          <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel="What happened?">
            <Text variant="smallStrong" tone="muted">
              What happened?
            </Text>
            <View className="flex-row gap-2">
              {OUTCOMES.map((o) => {
                const on = outcome === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      haptic.select();
                      setOutcome(o.value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    className={`flex-1 items-center justify-center rounded-input ${on ? "bg-forest" : "bg-surface"}`}
                    style={{ height: 52, borderWidth: 1.5, borderColor: on ? colors.forest : colors.lineStrong }}
                  >
                    <Text variant="bodyStrong" tone={on ? "onForest" : "ink"} style={{ fontSize: 15 }}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {outcome && outcome !== "skipped" ? (
            <Input
              label="How much did you get?"
              value={quantityNote}
              onChangeText={setQuantityNote}
              placeholder="e.g. 1 paint rubber, 2 tubers"
              maxLength={200}
            />
          ) : null}
          {outcome ? (
            <Input
              label={`Note for ${customerName}${needsNote ? "" : " (optional)"}`}
              value={shopperNote}
              onChangeText={setShopperNote}
              placeholder={outcome === "skipped" ? "e.g. No ripe plantain in the market today" : "e.g. Firm ones were small, so I got bigger ones"}
              maxLength={200}
              multiline
            />
          ) : null}

          <View className="gap-2">
            <Button label="Save item" size="lg" disabled={!!blocker || processing} onPress={save} />
            {blocker && outcome ? (
              <Text variant="small" tone="muted" className="text-center">
                {blocker}
              </Text>
            ) : null}
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
      <PaySheet
        sheet={paySheet}
        batchId={batchId}
        marketId={marketId}
        item={{ _id: item._id, name: item.name, budget: item.budget, approvedExtra: item.approvedExtra, photoUri }}
        paid={totals.paid + totals.sending}
        left={totals.left}
        beforePay={queueFreshPhoto}
      />
      <PriceCheckSheet
        sheet={pcSheet}
        item={{ _id: item._id, name: item.name, budget: item.budget, approvedExtra: item.approvedExtra }}
        customerName={customerName}
        timeoutMin={Math.round(timeoutSec / 60)}
      />
      <CameraCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={(uri) => void onCaptured(uri)} />
    </View>
  );
}
