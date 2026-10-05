import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { BookOpenText, ChatCircleText, MapPin, Moon, Palette, SignOut } from "phosphor-react-native";
import { formatNigerianPhone } from "@ojarun/shared";
import { Divider, ListItem, Screen, Text, useSheet } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { HowItWorksSheet } from "@/features/home/HowItWorksSheet";
import { useThemePreference } from "@/theme/ThemeProvider";
import { THEME_LABEL, ThemeSheet } from "./ThemeSheet";
import { SupportSheet } from "./SupportSheet";
import { SignOutSheet } from "./SignOutSheet";

function Group({ title, children }: { title: string; children: ReactNode[] }) {
  const rows = children.filter(Boolean);
  return (
    <View className="gap-2">
      <Text variant="caption" tone="faint" className="ml-1 uppercase" style={{ fontSize: 13, letterSpacing: 0.6 }} accessibilityRole="header">
        {title}
      </Text>
      <View className="rounded-card border border-line bg-surface px-4">
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 ? <Divider /> : null}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function AccountScreen({ audience }: { audience: "customer" | "shopper" }) {
  const me = useMe();
  const preference = useThemePreference((s) => s.preference);
  const themeSheet = useSheet();
  const supportSheet = useSheet();
  const signOutSheet = useSheet();
  const howItWorks = useSheet();

  const initials = (me?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <Screen title={audience === "shopper" ? "Profile" : "Account"} tabs>
      <View className="gap-[22px]">
        <View className="flex-row items-center gap-3.5 rounded-[22px] border border-line bg-surface p-4">
          <View className="h-[60px] w-[60px] items-center justify-center rounded-full bg-brand">
            <Text variant="heading" tone="onBrand" style={{ fontSize: 22 }}>
              {initials || "–"}
            </Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 18 }}>
              {me?.name ?? " "}
            </Text>
            {me?.phone ? (
              <Text variant="small" tone="faint" tabular>
                {formatNigerianPhone(me.phone)}
              </Text>
            ) : null}
            {me?.email ? (
              <Text variant="small" tone="faint" numberOfLines={1}>
                {me.email}
              </Text>
            ) : null}
            {audience === "shopper" ? (
              <Text variant="caption" tone="brand" className="mt-1">
                OjaRun shopper
              </Text>
            ) : null}
          </View>
        </View>

        {audience === "customer" ? (
          <Group title="Delivery">
            {[
              <ListItem key="addr" icon={MapPin} title="Saved addresses" subtitle="Where we deliver" onPress={() => router.push("/addresses")} />,
            ]}
          </Group>
        ) : null}

        <Group title="App">
          {[
            <ListItem
              key="theme"
              icon={preference === "dark" ? Moon : Palette}
              title="Appearance"
              subtitle={THEME_LABEL[preference]}
              onPress={themeSheet.present}
            />,
            __DEV__ ? (
              <ListItem key="kit" icon={Palette} title="UI kit" subtitle="Developer only" onPress={() => router.push("/ui-kit")} />
            ) : null,
          ]}
        </Group>

        <Group title="Support">
          {[
            <ListItem
              key="help"
              icon={ChatCircleText}
              title={audience === "shopper" ? "Contact ops" : "Chat with OjaRun"}
              subtitle="WhatsApp or call"
              onPress={supportSheet.present}
            />,
            audience === "customer" ? (
              <ListItem key="how" icon={BookOpenText} title="How OjaRun works" subtitle="Budgets, price checks, refunds" onPress={howItWorks.present} />
            ) : null,
          ]}
        </Group>

        <View className="rounded-card border-[1.5px] border-line-strong px-4">
          <ListItem icon={SignOut} title="Sign out" destructive onPress={signOutSheet.present} />
        </View>
      </View>

      <ThemeSheet sheet={themeSheet} />
      <SupportSheet sheet={supportSheet} audience={audience} />
      <SignOutSheet sheet={signOutSheet} />
      {audience === "customer" ? <HowItWorksSheet sheet={howItWorks} /> : null}
    </Screen>
  );
}
