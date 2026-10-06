import { useState } from "react";
import { Switch, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Storefront } from "phosphor-react-native";
import { api } from "@ojarun/convex/api";
import { formatLagosWindow, formatNaira } from "@ojarun/shared";
import { EmptyState, OfflineBanner, Pressable, Screen, Skeleton, Text, useToast } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { startQueued, useUploadQueue } from "@/features/shopper/useUploadQueue";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

type Run = FunctionReturnType<typeof api.shopper.today>[number];

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-NG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" }).format(new Date());
}

export default function ShopperToday() {
  const me = useMe();
  const runs = useQuery(api.shopper.today);
  const firstName = me?.name?.split(/\s+/)[0];
  return (
    <View className="flex-1 bg-bg">
      <Screen title={firstName ? `Hi, ${firstName}` : "Today"} subtitle={todayLabel()} tabs>
        <View className="gap-5">
          <ShiftCard />
          <View className="flex-row items-baseline justify-between">
            <Text variant="heading" accessibilityRole="header">
              Today's runs
            </Text>
            {runs?.length ? (
              <Text variant="small" tone="faint">
                {runs.length}
              </Text>
            ) : null}
          </View>
          {runs === undefined ? (
            <Skeleton height={150} />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Storefront}
              title="No runs yet"
              body="When ops confirms a market run for you, it shows up here with every order and item to buy."
            />
          ) : (
            <View className="gap-3">
              {runs.map((r) => (
                <RunCard key={r._id} run={r} />
              ))}
            </View>
          )}
        </View>
      </Screen>
      <OfflineBanner message="You're offline. Photos and updates will send when you're back." />
    </View>
  );
}

function ShiftCard() {
  const { colors } = useTheme();
  const toast = useToast();
  const profile = useQuery(api.shopper.profile);
  const setOnShift = useMutation(api.shopper.setOnShift);
  const [saving, setSaving] = useState(false);

  if (profile === undefined) return <Skeleton height={84} />;
  if (profile === null || !profile.active) {
    return (
      <View className="rounded-hero bg-surface-sunken p-[18px]">
        <Text variant="bodyStrong">Your shopper account isn't active</Text>
        <Text variant="small" tone="muted" className="mt-1">
          Call ops to get set up before your first run.
        </Text>
      </View>
    );
  }

  const toggle = async (next: boolean) => {
    setSaving(true);
    haptic.select();
    try {
      await setOnShift({ onShift: next });
    } catch (e) {
      toast.show({ message: friendlyError(e), tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const on = profile.onShift;
  return (
    <View className="flex-row items-center gap-3.5 rounded-hero bg-forest p-[18px]">
      <View
        className="items-center justify-center"
        style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: on ? "rgba(74,222,128,0.18)" : "transparent" }}
      >
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: on ? colors.live : colors.forestMuted }} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodyStrong" tone="onForest" style={{ fontSize: 18 }} className="font-extrabold">
          {on ? "You're on shift" : "You're off shift"}
        </Text>
        <Text variant="small" tone="onForestSoft">
          {on ? "Ops can give you market runs" : "Switch on when you're ready for runs"}
        </Text>
      </View>
      <Switch
        value={on}
        disabled={saving}
        onValueChange={(v) => void toggle(v)}
        accessibilityLabel="On shift"
        trackColor={{ false: "rgba(255,255,255,0.2)", true: colors.live }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function RunCard({ run }: { run: Run }) {
  const jobs = useUploadQueue((s) => s.jobs);
  const shopping = run.status === "in_progress" || startQueued(jobs, run._id);
  const pct = run.itemCount ? Math.round((run.doneCount / run.itemCount) * 100) : 0;
  const window = run.window ? formatLagosWindow(run.window.start, run.window.end) : "";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/run/[id]", params: { id: run._id } })}
      accessibilityRole="button"
      accessibilityLabel={`${run.marketName}, ${shopping ? "shopping now" : "ready"}, deliver ${window}`}
      className={`gap-3.5 rounded-card bg-surface p-4 ${shopping ? "border-2 border-brand" : "border border-line"}`}
    >
      <View className="flex-row items-center justify-between">
        <View className={`rounded-lg px-2.5 py-1 ${shopping ? "bg-brand-tint" : "bg-surface-sunken"}`}>
          <Text variant="caption" tone={shopping ? "brand" : "muted"} className="font-extrabold">
            {shopping ? "Shopping now" : "Ready"}
          </Text>
        </View>
        <Text variant="smallStrong" tone="muted">
          Deliver {window}
        </Text>
      </View>
      <View className="gap-1">
        <Text variant="title" style={{ fontSize: 22, lineHeight: 28 }}>
          {run.marketName}
        </Text>
        <Text variant="small" tone="faint">
          {run.orderCount} {run.orderCount === 1 ? "order" : "orders"} · {run.itemCount} items · {formatNaira(run.budgets)} in budgets
        </Text>
      </View>
      {shopping ? (
        <View className="gap-2">
          <View className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <View className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </View>
          <View className="flex-row justify-between">
            <Text variant="smallStrong">
              {run.doneCount} of {run.itemCount} done
            </Text>
            <Text variant="smallStrong" tone="brand">
              Continue
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
