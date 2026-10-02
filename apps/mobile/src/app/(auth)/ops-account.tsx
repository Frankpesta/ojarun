import { Desktop } from "phosphor-react-native";
import { useAuth } from "@clerk/expo";
import { Button, EmptyState, Screen } from "@/components";

export default function OpsAccountScreen() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <EmptyState
        icon={Desktop}
        title="This is an ops account"
        body="Ops accounts work in the OjaRun dashboard on the web, not in the app. Sign out to use a customer account here."
        action={<Button label="Sign out" variant="secondary" onPress={() => void signOut()} />}
      />
    </Screen>
  );
}
