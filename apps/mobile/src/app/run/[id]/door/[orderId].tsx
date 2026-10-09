import { useState } from "react";
import { Linking, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "convex/react";
import { ChatCircleDots, CheckCircle, Info, Phone } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";
import { formatLagosClock } from "@ojarun/shared";
import { BackButton, Button, Input, Pressable, Sheet, Skeleton, Text, useSheet, useToast } from "@/components";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

/** Matches the server's ARRIVED_WARN_METERS. */
const WARN_METERS = 500;

export default function ShopperDoorScreen() {
  return (
    <RoleGuard role="shopper">
      <Handover />
    </RoleGuard>
  );
}

/**
 * At the customer's door (approved "At the door" frame): wait while they check and accept,
 * collect anything rejected, and raise "not answering" so ops can call.
 */
function Handover() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id, orderId } = useLocalSearchParams<{ id: string; orderId: string }>();
  const batch = useQuery(api.shopper.batch, id ? { batchId: id as Id<"batches"> } : "skip");
  const unavailable = useMutation(api.delivery.customerUnavailable);
  const sheet = useSheet();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  if (batch === undefined) {
    return (
      <SafeAreaView className="flex-1 gap-4 bg-bg px-gutter">
        <BackButton />
        <Skeleton height={200} />
      </SafeAreaView>
    );
  }
  const order = batch?.orders.find((o) => o._id === orderId);
  if (!batch || !order) {
    return (
      <SafeAreaView className="flex-1 gap-3 bg-bg px-gutter">
        <BackButton />
        <Text variant="heading">This order isn't on your run</Text>
      </SafeAreaView>
    );
  }

  const name = order.customer.firstName;
  const delivered = order.status === "completed";
  const rejected = order.items.filter((i) => i.status === "rejected");
  const kept = order.items.filter((i) => i.status === "bought" || i.status === "adjusted").length;
  const far = order.arrivedDistanceMeters !== null && order.arrivedDistanceMeters > WARN_METERS;

  const raise = async () => {
    setSending(true);
    try {
      await unavailable({ orderId: order._id, note: note.trim() || undefined });
      haptic.warning();
      sheet.dismiss();
      setNote("");
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="flex-1 bg-bg">
      <SafeAreaView edges={["top"]} className="flex-1">
        <ScrollView contentContainerClassName="gap-4 px-gutter pb-6" showsVerticalScrollIndicator={false}>
          <BackButton />
          <View className={`flex-row items-center gap-2 self-start rounded-full px-3 py-1.5 ${delivered ? "bg-brand" : "bg-brand-tint"}`} accessibilityLiveRegion="polite">
            {delivered ? <CheckCircle size={16} color={colors.onBrand} weight="fill" /> : <View className="rounded-full bg-brand" style={{ width: 8, height: 8 }} />}
            <Text variant="smallStrong" tone={delivered ? "onBrand" : "brand"} className="font-extrabold">
              {delivered ? `${name} accepted. Delivered!` : `${name} is checking the items`}
            </Text>
          </View>
          <Text variant="title" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 33 }}>
            At {name}'s door
          </Text>
          <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
            {delivered
              ? "All done here. Head to your next stop."
              : `Hand everything over. ${name} checks each item on their phone and accepts. Wait here until they do.`}
          </Text>

          {far && !delivered ? (
            <View className="flex-row gap-2.5 rounded-card bg-warning-tint p-3.5">
              <Info size={20} color={colors.warningInk} weight="bold" />
              <Text variant="small" tone="warningInk" className="flex-1">
                You're about {Math.round(order.arrivedDistanceMeters! / 50) * 50} m from the pin. If this is the right house, carry on.
              </Text>
            </View>
          ) : null}

          {order.unavailableAt && !delivered ? (
            <View className="gap-1 rounded-card bg-accent-tint p-3.5">
              <Text variant="smallStrong" tone="accent">
                Ops was told at {formatLagosClock(order.unavailableAt)}
              </Text>
              <Text variant="small">They're calling {name}. Wait a few minutes; ops will call you with what to do.</Text>
            </View>
          ) : null}

          {rejected.length ? (
            <View className="gap-1.5 rounded-[18px] border-2 border-error bg-surface p-3.5">
              <Text variant="caption" tone="error" className="font-extrabold uppercase" style={{ letterSpacing: 0.4 }}>
                Take back · {rejected.length} {rejected.length === 1 ? "item" : "items"}
              </Text>
              {rejected.map((i) => (
                <View key={i._id} className="gap-0.5">
                  <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                    {i.name}
                  </Text>
                  {i.rejectionReason ? (
                    <Text variant="small" tone="muted">
                      “{i.rejectionReason}” Bring it back to the office.
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View className="flex-row justify-between rounded-[18px] border border-line bg-surface p-3.5">
            <Text variant="body" tone="muted" style={{ fontSize: 15 }}>
              Kept
            </Text>
            <Text variant="bodyStrong" className="font-extrabold">
              {kept} of {order.items.length} items
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} className="gap-2.5 border-t border-line bg-surface px-gutter pb-2 pt-4">
        {delivered ? (
          <Button label="Back to deliveries" size="lg" onPress={() => router.back()} />
        ) : (
          <>
            <View className="flex-row gap-2">
              {order.customer.phone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${order.customer.phone}`)}
                  accessibilityRole="button"
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-input bg-brand-tint"
                  style={{ height: 48 }}
                >
                  <Phone size={18} color={colors.brand} weight="bold" />
                  <Text variant="bodyStrong" tone="brand" style={{ fontSize: 15 }}>
                    Call {name}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => router.push({ pathname: "/chat/[orderId]", params: { orderId: order._id } })}
                accessibilityRole="button"
                className="flex-1 flex-row items-center justify-center gap-2 rounded-input bg-surface-sunken"
                style={{ height: 48 }}
              >
                <ChatCircleDots size={18} color={colors.ink} weight="bold" />
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  Chat
                </Text>
              </Pressable>
            </View>
            <Button label={`${name} isn't answering`} variant="secondary" onPress={() => sheet.present()} />
            <Text variant="small" tone="faint" className="text-center">
              Ops will call them and tell you what to do.
            </Text>
          </>
        )}
      </SafeAreaView>

      <Sheet
        sheet={sheet}
        variant="form"
        title={`Tell ops ${name} isn't answering?`}
        subtitle="Ops calls them straight away and will call you back."
        dirty={note.length > 0}
        footer={<Button label="Tell ops" size="lg" loading={sending} onPress={() => void raise()} />}
      >
        <Input label="Anything ops should know? (optional)" inSheet value={note} onChangeText={setNote} placeholder="e.g. Gate locked, no answer on the phone" maxLength={200} />
      </Sheet>
    </View>
  );
}
