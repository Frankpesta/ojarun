import { View } from "react-native";
import { ClockCounterClockwise } from "phosphor-react-native";
import { formatNaira } from "@ojarun/shared";
import { Card, EmptyState, Screen, Text } from "@/components";
import { useMe } from "@/features/auth/useSession";

export default function CustomerWallet() {
  const me = useMe();
  return (
    <Screen title="Wallet">
      <Card className="gap-1 p-5">
        <Text variant="small" tone="muted">
          Available balance
        </Text>
        <Text variant="display" tabular accessibilityLabel={`Balance ${formatNaira(me?.walletBalance ?? 0)}`}>
          {formatNaira(me?.walletBalance ?? 0)}
        </Text>
        <Text variant="small" tone="muted" className="mt-2">
          Leftover money and credits land here. Use it on your next order, or withdraw it to your bank.
        </Text>
      </Card>

      <View className="mt-8">
        <Text variant="heading" className="mb-1">
          Activity
        </Text>
        <EmptyState
          icon={ClockCounterClockwise}
          title="Nothing here yet"
          body="When an order finishes, any money we didn't spend shows up here."
        />
      </View>
    </Screen>
  );
}
