import { View } from "react-native";
import { Image } from "expo-image";
import { useNetInfo } from "@react-native-community/netinfo";
import { CheckCircle, CloudArrowUp, CloudCheck, Storefront, Warning, WifiSlash } from "phosphor-react-native";
import { lagosDate } from "@ojarun/shared";
import { Button, EmptyState, Screen, Text } from "@/components";
import { useUploadQueue, type QueueJob } from "@/features/shopper/useUploadQueue";
import { useTheme } from "@/theme/ThemeProvider";

const OUTCOME_LABEL = { bought: "bought", adjusted: "changed", skipped: "not there" } as const;

function describe(job: QueueJob): string {
  switch (job.type) {
    case "startShopping":
      return "Start shopping";
    case "uploadPhoto":
      return `${job.itemName} photo`;
    case "setOutcome":
      return `${job.itemName} · ${OUTCOME_LABEL[job.outcome]}`;
  }
}

export default function ShopperQueue() {
  const { colors } = useTheme();
  const jobs = useUploadQueue((s) => s.jobs);
  const sent = useUploadQueue((s) => s.sent);
  const retryNow = useUploadQueue((s) => s.retryNow);
  const discard = useUploadQueue((s) => s.discard);
  const { isConnected } = useNetInfo();
  const offline = isConnected === false;
  const sentToday = sent.date === lagosDate(Date.now()) ? sent.count : 0;
  const ordered = [...jobs].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <Screen title="Uploads" subtitle="Saved on your phone until they send" tabs>
      <View className="gap-[18px]">
        {offline ? (
          <View className="flex-row items-center gap-3 rounded-[18px] bg-warning-tint p-3.5" accessibilityLiveRegion="polite">
            <WifiSlash size={22} color={colors.warningInk} weight="bold" />
            <View className="flex-1 gap-0.5">
              <Text variant="bodyStrong" tone="warningInk" style={{ fontSize: 15 }} className="font-extrabold">
                No signal
              </Text>
              <Text variant="small" tone="warningInk">
                Keep shopping. Everything sends by itself when you're back online.
              </Text>
            </View>
          </View>
        ) : null}

        {ordered.length === 0 ? (
          <EmptyState
            icon={CloudCheck}
            title="Everything's sent"
            body="If your network drops at the market, anything you do is saved here and sent automatically."
          />
        ) : (
          <View className="overflow-hidden rounded-card border border-line bg-surface">
            {ordered.map((job, i) => {
              const failed = job.status === "failed";
              return (
                <View key={job.id} className={`gap-2.5 px-3.5 py-3 ${i < ordered.length - 1 ? "border-b border-line-soft" : ""}`}>
                  <View className="flex-row items-center gap-3">
                    {failed ? (
                      <View className="items-center justify-center rounded-xl bg-error-tint" style={{ width: 48, height: 48 }}>
                        <Warning size={22} color={colors.error} weight="bold" />
                      </View>
                    ) : job.type === "uploadPhoto" ? (
                      <Image source={{ uri: job.fileUri }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />
                    ) : (
                      <View className="items-center justify-center rounded-xl bg-surface-sunken" style={{ width: 48, height: 48 }}>
                        {job.type === "startShopping" ? (
                          <Storefront size={22} color={colors.inkMuted} weight="bold" />
                        ) : (
                          <CheckCircle size={22} color={colors.inkMuted} weight="bold" />
                        )}
                      </View>
                    )}
                    <View className="flex-1 gap-0.5">
                      <Text variant="bodyStrong" style={{ fontSize: 15 }} numberOfLines={1}>
                        {describe(job)}
                      </Text>
                      <Text variant="small" tone={failed ? "error" : "faint"} numberOfLines={2}>
                        {failed ? `Didn't save: ${job.lastError ?? "try again"}` : job.status === "running" ? "Sending…" : offline ? "Waiting for signal" : "Waiting to send"}
                      </Text>
                    </View>
                    {failed ? null : job.status === "running" ? (
                      <CloudArrowUp size={18} color={colors.brand} weight="bold" />
                    ) : (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning }} />
                    )}
                  </View>
                  {failed ? (
                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Button label="Discard" variant="secondary" size="sm" onPress={() => discard(job.id)} />
                      </View>
                      <View className="flex-1">
                        <Button label="Try again" size="sm" onPress={() => retryNow(job.id)} />
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {sentToday ? (
          <Text variant="small" tone="faint" className="text-center">
            Sent today: {sentToday}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
