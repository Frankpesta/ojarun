import { View } from "react-native";
import { router } from "expo-router";
import { Plus } from "phosphor-react-native";
import { Button, Screen, Sticker, Text } from "@/components";

export default function CustomerOrders() {
  return (
    <Screen title="Orders" tabs>
      <View className="items-center gap-5 rounded-hero border border-line bg-surface px-6 py-10">
        <View className="flex-row" accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={{ transform: [{ rotate: "-8deg" }] }}>
            <Sticker kind="tomato" size={64} />
          </View>
          <View style={{ marginLeft: -14, marginTop: -8, transform: [{ rotate: "6deg" }] }}>
            <Sticker kind="fish" size={64} />
          </View>
          <View style={{ marginLeft: -14, transform: [{ rotate: "-4deg" }] }}>
            <Sticker kind="plantain" size={64} />
          </View>
        </View>
        <View className="items-center gap-2">
          <Text variant="heading" className="text-center">
            No orders yet
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            Your market runs show up here, with a photo of every item we buy and the change we send back.
          </Text>
        </View>
        <Button label="Start a list" icon={Plus} fullWidth={false} onPress={() => router.push("/home")} />
      </View>
    </Screen>
  );
}
