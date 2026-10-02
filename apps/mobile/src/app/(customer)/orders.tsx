import { Receipt } from "phosphor-react-native";
import { EmptyState, Screen } from "@/components";

export default function CustomerOrders() {
  return (
    <Screen title="Orders">
      <EmptyState
        icon={Receipt}
        title="No orders yet"
        body="Your market runs will show here, with a photo of everything we buy for you."
      />
    </Screen>
  );
}
