import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera, Clock, Wallet, type Icon as PhosphorIcon } from "phosphor-react-native";
import { Button, Sticker, Text, type StickerKind } from "@/components";
import { useTheme } from "@/theme/ThemeProvider";

/** Loose market-table collage; positions are fractions of the collage area. */
const COLLAGE: { kind: StickerKind; size: number; x: number; y: number; rotate: number }[] = [
  { kind: "tomato", size: 96, x: 0.06, y: 0.1, rotate: -8 },
  { kind: "plantain", size: 84, x: 0.38, y: 0.04, rotate: 6 },
  { kind: "fish", size: 96, x: 0.7, y: 0.14, rotate: 10 },
  { kind: "pepper", size: 84, x: 0.2, y: 0.47, rotate: 5 },
  { kind: "yam", size: 104, x: 0.5, y: 0.4, rotate: -6 },
  { kind: "onion", size: 72, x: 0.0, y: 0.78, rotate: -4 },
  { kind: "eggs", size: 72, x: 0.78, y: 0.72, rotate: 8 },
  { kind: "leaves", size: 64, x: 0.36, y: 0.84, rotate: -10 },
];

const PROMISES: { icon: PhosphorIcon; label: string }[] = [
  { icon: Camera, label: "A photo of every item" },
  { icon: Wallet, label: "Change goes to your wallet" },
  { icon: Clock, label: "Delivered the same day" },
];

export default function WelcomeScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const collageWidth = width - 40;

  return (
    <View className="flex-1 bg-forest">
      <StatusBar style="light" />
      <SafeAreaView edges={["top"]} className="flex-1">
        <View className="flex-row items-center justify-between px-6 pt-3">
          <Text variant="title" tone="onForest" accessibilityRole="header" accessibilityLabel="OjaRun" style={{ fontSize: 26 }}>
            Oja<Text variant="title" tone="inherit" style={{ color: "#FF8A5B", fontSize: 26 }}>Run</Text>
          </Text>
          <View className="rounded-full bg-on-forest/10 px-3 py-1.5">
            <Text variant="caption" tone="forestMuted">
              Akure
            </Text>
          </View>
        </View>

        <View className="flex-1 mx-5 my-4" accessible={false} importantForAccessibility="no-hide-descendants">
          {COLLAGE.map((s) => (
            <View
              key={s.kind}
              style={{
                position: "absolute",
                left: `${s.x * 100}%`,
                top: `${s.y * 100}%`,
                transform: [{ rotate: `${s.rotate}deg` }, { scale: Math.min(1, collageWidth / 350) }],
              }}
            >
              <Sticker kind={s.kind} size={s.size} />
            </View>
          ))}
        </View>
      </SafeAreaView>

      <SafeAreaView edges={["bottom"]} className="rounded-t-[32px] bg-bg px-6 pt-8 pb-4 gap-5">
        <View className="gap-2.5">
          <Text variant="display" style={{ fontSize: 34, lineHeight: 38 }}>
            Your market run, done for you.
          </Text>
          <Text variant="body" tone="muted">
            Send your list and a budget for each item. A trusted shopper buys it fresh at the market you pick and
            delivers it today.
          </Text>
        </View>
        <View className="flex-row gap-2">
          {PROMISES.map(({ icon: Icon, label }) => (
            <View key={label} className="flex-1 gap-2 rounded-2xl bg-surface p-3">
              <Icon size={22} color={colors.brand} weight="bold" />
              <Text variant="caption" style={{ fontSize: 13, lineHeight: 17 }}>
                {label}
              </Text>
            </View>
          ))}
        </View>
        <View className="gap-1">
          <Button label="Get started" onPress={() => router.push("/email")} />
          <Button label="I already have an account" variant="ghost" onPress={() => router.push("/email")} />
        </View>
      </SafeAreaView>
    </View>
  );
}
