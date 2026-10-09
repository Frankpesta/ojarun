import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { File, UploadType } from "expo-file-system";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Camera, Phone, WarningCircle } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosClock } from "@ojarun/shared";
import { fontFamily } from "@ojarun/ui";
import { BackButton, Pressable, Skeleton, Text, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { ApproveSheet } from "@/features/chat/ApproveSheet";
import { PriceCheckCard, type ChatMessage } from "@/features/chat/PriceCheckCard";
import { CameraCapture } from "@/features/shopper/CameraCapture";
import { deleteQueuedPhoto, prepareItemPhoto } from "@/features/shopper/photos";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

export default function ChatScreen() {
  return (
    <RoleGuard role={["customer", "shopper"]}>
      <Chat />
    </RoleGuard>
  );
}

/** A message on its way: shown straight away, replaced by the server's copy when it lands. */
type Outgoing = { id: string; body?: string; imageUri?: string; failed?: boolean };

async function uploadJpeg(url: string, uri: string): Promise<Id<"_storage">> {
  const res = await new File(uri).upload(url, {
    httpMethod: "POST",
    uploadType: UploadType.BINARY_CONTENT,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Upload failed (${res.status})`);
  return (JSON.parse(res.body) as { storageId: Id<"_storage"> }).storageId;
}

function Chat() {
  const { colors } = useTheme();
  const toast = useToast();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const id = orderId as Id<"orders">;
  const chat = useQuery(api.chat.list, orderId ? { orderId: id } : "skip");
  const settings = useQuery(api.settings.publicSettings);
  const send = useMutation(api.chat.send);
  const uploadUrl = useMutation(api.chat.generateUploadUrl);
  const markRead = useMutation(api.chat.markRead);
  const approveSheet = useSheet();

  const [draft, setDraft] = useState("");
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [approving, setApproving] = useState<ChatMessage | null>(null);
  const list = useRef<FlatList>(null);

  const count = chat?.messages.length ?? 0;
  useEffect(() => {
    if (chat && chat.side !== "ops") void markRead({ orderId: id }).catch(() => {});
  }, [count, chat?.side, id, markRead]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop local copies once the server has them.
  const landed = useMemo(() => new Set(chat?.messages.map((m) => m.clientRequestId)), [chat?.messages]);
  useEffect(() => {
    setOutgoing((o) => {
      const keep = o.filter((m) => !landed.has(m.id));
      for (const m of o) if (landed.has(m.id) && m.imageUri) deleteQueuedPhoto(m.imageUri);
      return keep.length === o.length ? o : keep;
    });
  }, [landed]);

  if (chat === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={60} />
        <Skeleton height={240} />
      </SafeAreaView>
    );
  }
  if (chat === null) {
    return (
      <SafeAreaView className="flex-1 gap-3 bg-bg px-gutter">
        <BackButton />
        <Text variant="heading">This chat isn't available</Text>
      </SafeAreaView>
    );
  }

  const other = chat.other?.name ?? (chat.side === "customer" ? "Your shopper" : "Customer");
  const totalSec = settings?.priceCheckTimeoutSec ?? 300;

  const deliver = async (m: Outgoing) => {
    setOutgoing((o) => o.map((x) => (x.id === m.id ? { ...x, failed: false } : x)));
    try {
      let imageId: Id<"_storage"> | undefined;
      if (m.imageUri) imageId = await uploadJpeg(await uploadUrl({ orderId: id }), m.imageUri);
      await send({ clientRequestId: m.id, orderId: id, body: m.body, imageId });
    } catch (e) {
      setOutgoing((o) => o.map((x) => (x.id === m.id ? { ...x, failed: true } : x)));
      toast.show({ message: friendlyError(e, "Couldn't send. Tap the message to try again."), tone: "error" });
    }
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    const m: Outgoing = { id: randomUUID(), body };
    setOutgoing((o) => [...o, m]);
    setDraft("");
    haptic.light();
    void deliver(m);
  };

  const onPhoto = async (raw: string) => {
    setCameraOpen(false);
    try {
      const mid = randomUUID();
      const m: Outgoing = { id: mid, imageUri: await prepareItemPhoto(raw, mid) };
      setOutgoing((o) => [...o, m]);
      void deliver(m);
    } catch {
      toast.show({ message: "Couldn't save that photo. Try again.", tone: "error" });
    }
  };

  type Row = { kind: "server"; m: ChatMessage } | { kind: "local"; m: Outgoing };
  const rows: Row[] = [...chat.messages.map((m) => ({ kind: "server" as const, m })), ...outgoing.map((m) => ({ kind: "local" as const, m }))];
  const lastMine = [...chat.messages].reverse().find((m) => m.mine && m.type !== "system");
  const seen = !!(lastMine && chat.otherReadAt && chat.otherReadAt >= lastMine.at);
  const subtitle =
    chat.side === "customer"
      ? chat.status === "shopping"
        ? `Shopping at ${chat.marketName}`
        : chat.status === "en_route"
          ? "On the way to you"
          : chat.status === "arrived"
            ? "At your door"
            : chat.open
              ? `Shopping soon at ${chat.marketName}`
              : "Order finished"
      : `Order #${chat.code}`;

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="border-b border-line bg-surface">
        <View className="flex-row items-center gap-2.5 px-3 pb-3 pt-1">
          <BackButton />
          <View className="items-center justify-center rounded-full bg-accent-tint" style={{ width: 40, height: 40 }}>
            <Text variant="smallStrong" className="font-extrabold">
              {other.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" className="font-extrabold" numberOfLines={1}>
              {other}
            </Text>
            <Text variant="small" tone={chat.side === "customer" && chat.open ? "brand" : "muted"} numberOfLines={1} className="font-semibold">
              {subtitle}
            </Text>
          </View>
          {chat.other?.phone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${chat.other!.phone}`)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${other}`}
              className="items-center justify-center rounded-full bg-brand-tint"
              style={{ width: 44, height: 44 }}
            >
              <Phone size={20} color={colors.brand} weight="bold" />
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(r) => (r.kind === "server" ? r.m._id : r.m.id)}
          contentContainerClassName="gap-3 p-4"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text variant="small" tone="muted" className="mt-10 text-center">
              {chat.side === "customer" ? `Say hello to ${other}. Ask for anything special.` : `Messages with ${other} show here.`}
            </Text>
          }
          renderItem={({ item: r }) => {
            if (r.kind === "local") return <Bubble mine body={r.m.body} imageUri={r.m.imageUri} failed={r.m.failed} sending={!r.m.failed} onRetry={() => void deliver(r.m)} />;
            const m = r.m;
            if (m.type === "system") return <SystemLine body={m.body ?? ""} at={m.at} positive={/approved/.test(m.body ?? "")} />;
            if (m.type === "price_check") {
              return (
                <PriceCheckCard
                  message={m}
                  side={chat.side}
                  totalSec={totalSec}
                  otherName={other}
                  bufferLeft={chat.funding?.bufferLeft ?? 0}
                  onApprove={() => {
                    setApproving(m);
                    approveSheet.present();
                  }}
                />
              );
            }
            return (
              <View className="gap-1">
                <Bubble mine={m.mine} body={m.body ?? undefined} imageUri={m.imageUrl ?? undefined} />
                {m._id === lastMine?._id && seen ? (
                  <Text variant="caption" tone="faint" className="self-end">
                    Seen
                  </Text>
                ) : null}
              </View>
            );
          }}
        />

        <SafeAreaView edges={["bottom"]} className="border-t border-line bg-surface">
          {chat.open ? (
            <View className="flex-row items-end gap-2 px-3 py-2.5">
              <Pressable
                onPress={() => setCameraOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                className="items-center justify-center rounded-input bg-surface-sunken"
                style={{ width: 48, height: 48 }}
              >
                <Camera size={22} color={colors.ink} weight="bold" />
              </Pressable>
              <View className="flex-1 justify-center rounded-input bg-surface-sunken px-3.5" style={{ minHeight: 48 }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={`Message ${other}`}
                  placeholderTextColor={colors.placeholder}
                  accessibilityLabel={`Message ${other}`}
                  multiline
                  maxLength={1000}
                  style={{ fontFamily: fontFamily.regular, fontSize: 15, color: colors.ink, paddingVertical: 12, maxHeight: 120 }}
                  cursorColor={colors.brand}
                  selectionColor={colors.brand}
                />
              </View>
              <Pressable
                onPress={sendText}
                disabled={!draft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Send"
                className={`items-center justify-center rounded-input bg-brand ${draft.trim() ? "" : "opacity-40"}`}
                style={{ width: 48, height: 48 }}
              >
                <ArrowRight size={20} color={colors.onBrand} weight="bold" />
              </Pressable>
            </View>
          ) : (
            <Text variant="small" tone="muted" className="px-gutter py-4 text-center">
              {chat.status === "completed" ? "This chat closed when the order was delivered." : "This chat is closed."}
            </Text>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>

      {chat.side === "customer" ? (
        <ApproveSheet
          sheet={approveSheet}
          message={approving ? (chat.messages.find((m) => m._id === approving._id) ?? approving) : null}
          totalSec={totalSec}
          shopperName={other}
          bufferLeft={chat.funding?.bufferLeft ?? 0}
          walletBalance={chat.funding?.walletBalance ?? 0}
        />
      ) : null}
      <CameraCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCaptured={(uri) => void onPhoto(uri)} />
    </View>
  );
}

function SystemLine({ body, at, positive }: { body: string; at: number; positive: boolean }) {
  return (
    <View className={`max-w-[300px] self-center rounded-xl px-3 py-1.5 ${positive ? "bg-brand-tint" : "bg-surface-sunken"}`}>
      <Text variant="caption" tone={positive ? "brand" : "muted"} className="text-center font-bold">
        {body} · {formatLagosClock(at)}
      </Text>
    </View>
  );
}

function Bubble({
  mine,
  body,
  imageUri,
  sending,
  failed,
  onRetry,
}: {
  mine: boolean;
  body?: string;
  imageUri?: string;
  sending?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View
      className={`gap-2 ${mine ? "self-end bg-brand" : "self-start border border-line bg-surface"} ${sending ? "opacity-70" : ""}`}
      style={{
        maxWidth: 270,
        padding: imageUri ? 6 : 0,
        borderRadius: 18,
        borderBottomRightRadius: mine ? 6 : 18,
        borderBottomLeftRadius: mine ? 18 : 6,
      }}
    >
      {imageUri ? <Image source={{ uri: imageUri }} style={{ width: 240, height: 240, borderRadius: 14 }} contentFit="cover" accessibilityLabel="Photo" /> : null}
      {body ? (
        <Text variant="body" tone={mine ? "onBrand" : "ink"} style={{ fontSize: 15, lineHeight: 21, paddingHorizontal: imageUri ? 8 : 14, paddingVertical: imageUri ? 4 : 10 }}>
          {body}
        </Text>
      ) : null}
    </View>
  );
  if (!failed) return content;
  return (
    <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Not sent. Tap to try again" className="gap-1 self-end">
      {content}
      <View className="flex-row items-center gap-1 self-end">
        <WarningCircle size={14} color={colors.error} weight="bold" />
        <Text variant="caption" tone="error">
          Not sent · tap to retry
        </Text>
      </View>
    </Pressable>
  );
}
