import { View } from "react-native";
import { Storefront } from "phosphor-react-native";
import { EmptyState, OfflineBanner, Screen } from "@/components";
import { useMe } from "@/features/auth/useSession";

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Lagos",
  }).format(new Date());
}

export default function ShopperToday() {
  const me = useMe();
  const firstName = me?.name?.split(/\s+/)[0];
  return (
    <View className="flex-1 bg-bg">
      <Screen title={firstName ? `Hi, ${firstName}` : "Today"} subtitle={todayLabel()} tabs>
        <EmptyState
          icon={Storefront}
          title="No batches yet"
          body="When ops assigns you a market run, it shows up here with every order and item to buy."
        />
      </Screen>
      <OfflineBanner message="You're offline. Photos and payments will send when you're back." />
    </View>
  );
}
