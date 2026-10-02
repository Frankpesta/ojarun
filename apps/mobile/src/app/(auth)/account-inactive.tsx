import { LockSimple } from "phosphor-react-native";
import { useAuth } from "@clerk/expo";
import { Button, EmptyState, Screen } from "@/components";

export default function AccountInactiveScreen() {
  const { signOut } = useAuth();
  return (
    <Screen footer={<Button label="Sign out" variant="secondary" onPress={() => void signOut()} />}>
      <EmptyState
        icon={LockSimple}
        title="Your account is paused"
        body="You can't place or manage orders right now. Call or WhatsApp OjaRun support and we'll sort it out with you."
      />
    </Screen>
  );
}
