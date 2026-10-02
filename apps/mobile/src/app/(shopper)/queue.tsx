import { CloudCheck } from "phosphor-react-native";
import { EmptyState, Screen } from "@/components";

export default function ShopperQueue() {
  return (
    <Screen title="Uploads" subtitle="Photos, payments and status updates waiting to send.">
      <EmptyState
        icon={CloudCheck}
        title="Everything's sent"
        body="If your network drops at the market, anything you do is saved here and sent automatically."
      />
    </Screen>
  );
}
