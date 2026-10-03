import { View } from "react-native";
import { router } from "expo-router";
import { ChatCircleText, MapPin, Moon, Palette, SignOut } from "phosphor-react-native";
import { formatNigerianPhone } from "@ojarun/shared";
import { Card, Divider, ListItem, Screen, Text, useSheet } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { useThemePreference } from "@/theme/ThemeProvider";
import { THEME_LABEL, ThemeSheet } from "./ThemeSheet";
import { SupportSheet } from "./SupportSheet";
import { SignOutSheet } from "./SignOutSheet";

export function AccountScreen({ audience }: { audience: "customer" | "shopper" }) {
  const me = useMe();
  const preference = useThemePreference((s) => s.preference);
  const themeSheet = useSheet();
  const supportSheet = useSheet();
  const signOutSheet = useSheet();

  const initials = (me?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  return (
    <Screen title={audience === "shopper" ? "Profile" : "Account"}>
      <Card className="flex-row items-center gap-4">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
          <Text variant="heading" tone="brand">
            {initials || "–"}
          </Text>
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {me?.name ?? " "}
          </Text>
          <Text variant="small" tone="muted" tabular>
            {me ? formatNigerianPhone(me.phone) : " "}
          </Text>
          {audience === "shopper" ? (
            <Text variant="caption" tone="brand" className="mt-1">
              OjaRun shopper
            </Text>
          ) : null}
        </View>
      </Card>

      <View className="mt-6">
        <Text variant="caption" tone="muted" className="mb-1 uppercase tracking-wider">
          Settings
        </Text>
        {audience === "customer" ? (
          <>
            <ListItem icon={MapPin} title="Saved addresses" subtitle="Where we deliver" onPress={() => router.push("/addresses")} />
            <Divider />
          </>
        ) : null}
        <ListItem
          icon={preference === "dark" ? Moon : Palette}
          title="Appearance"
          trailing={
            <Text variant="small" tone="muted">
              {THEME_LABEL[preference]}
            </Text>
          }
          onPress={themeSheet.present}
        />
        <Divider />
        <ListItem
          icon={ChatCircleText}
          title={audience === "shopper" ? "Contact ops" : "Get help"}
          subtitle="WhatsApp or call"
          onPress={supportSheet.present}
        />
        {__DEV__ ? (
          <>
            <Divider />
            <ListItem icon={Palette} title="UI kit" subtitle="Developer only" onPress={() => router.push("/ui-kit")} />
          </>
        ) : null}
      </View>

      <View className="mt-6">
        <ListItem icon={SignOut} title="Sign out" destructive onPress={signOutSheet.present} />
      </View>

      <ThemeSheet sheet={themeSheet} />
      <SupportSheet sheet={supportSheet} audience={audience} />
      <SignOutSheet sheet={signOutSheet} />
    </Screen>
  );
}
