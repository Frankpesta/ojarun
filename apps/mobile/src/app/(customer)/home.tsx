import { View } from "react-native";
import { router } from "expo-router";
import { ArrowRight, Basket } from "phosphor-react-native";
import { formatNaira } from "@ojarun/shared";
import { Button, Card, OfflineBanner, Pressable, Screen, Text, useSheet } from "@/components";
import { useMe } from "@/features/auth/useSession";
import { HowItWorksSheet } from "@/features/home/HowItWorksSheet";
import { greeting } from "@/lib/time";
import { useTheme } from "@/theme/ThemeProvider";

export default function CustomerHome() {
  const me = useMe();
  const { colors } = useTheme();
  const howItWorks = useSheet();
  const firstName = me?.name?.split(/\s+/)[0];

  return (
    <View className="flex-1 bg-bg">
      <Screen title={firstName ? `${greeting()}, ${firstName}` : greeting()} subtitle="What do you need from the market today?">
        <View className="gap-4">
          <View className="rounded-card bg-brand-tint p-5 gap-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-surface">
              <Basket size={26} color={colors.brand} weight="duotone" />
            </View>
            <View className="gap-1.5">
              <Text variant="heading">Your market run, done for you</Text>
              <Text variant="body" tone="muted">
                Tell us what to buy and your budget for each item. We shop at the market you choose, photograph
                everything, and deliver today.
              </Text>
            </View>
            <Button label="See how it works" onPress={howItWorks.present} />
          </View>

          <Pressable
            scale={false}
            onPress={() => router.push("/wallet")}
            accessibilityRole="button"
            accessibilityLabel={`Wallet balance ${formatNaira(me?.walletBalance ?? 0)}`}
          >
            <Card className="flex-row items-center justify-between">
              <View className="gap-0.5">
                <Text variant="small" tone="muted">
                  Wallet balance
                </Text>
                <Text variant="heading" tabular>
                  {formatNaira(me?.walletBalance ?? 0)}
                </Text>
              </View>
              <ArrowRight size={20} color={colors.inkFaint} />
            </Card>
          </Pressable>
        </View>
      </Screen>
      <OfflineBanner />
      <HowItWorksSheet sheet={howItWorks} />
    </View>
  );
}
