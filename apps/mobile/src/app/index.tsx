import { useEffect } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import { useSplash } from "@/features/splash/AnimatedSplash";
import { isConfigured } from "@/lib/config";
import { useSession } from "@/features/auth/useSession";
import { Button, EmptyState, Screen } from "@/components";
import { WifiSlash } from "phosphor-react-native";

/** Role router (05 §5.2): signed out → auth; then the user's server-side role picks the app. */
export default function Index() {
  if (!isConfigured) return <Redirect href="/setup" />;
  return <SessionGate />;
}

function SessionGate() {
  const session = useSession();

  useEffect(() => {
    if (session.status !== "loading") useSplash.getState().markReady();
  }, [session.status]);

  switch (session.status) {
    case "loading":
      // The animated splash stays up until we know where to go.
      return <View className="flex-1 bg-bg" />;
    case "signedOut":
      return <Redirect href="/email" />;
    case "error":
      return (
        <Screen>
          <EmptyState
            icon={WifiSlash}
            title="We couldn't reach OjaRun"
            body="Check your connection, then try again."
            action={<Button label="Try again" onPress={session.retry} />}
          />
        </Screen>
      );
    case "ready": {
      const { me } = session;
      if (me.status !== "active") return <Redirect href="/account-inactive" />;
      if (me.needsProfile) return <Redirect href="/profile-setup" />;
      if (me.role === "shopper") return <Redirect href="/today" />;
      if (me.role === "ops") return <Redirect href="/ops-account" />;
      return <Redirect href="/home" />;
    }
  }
}
