import { View } from "react-native";
import { router } from "expo-router";
import { Wrench } from "phosphor-react-native";
import { Button, Card, EmptyState, Screen, Text } from "@/components";
import { missingConfig } from "@/lib/config";

/** Dev-only: shown when env vars are missing, so the UI kit still runs before accounts exist. */
export default function SetupScreen() {
  return (
    <Screen
      footer={__DEV__ ? <Button label="Open the UI kit" onPress={() => router.push("/ui-kit")} /> : undefined}
    >
      <EmptyState
        icon={Wrench}
        title="Almost ready"
        body="This build is missing its connection settings. Add them to apps/mobile/.env.local and restart Metro."
      />
      <Card className="gap-2">
        {missingConfig.map((name) => (
          <View key={name} className="flex-row items-center gap-2">
            <View className="h-1.5 w-1.5 rounded-full bg-error" />
            <Text variant="small" tabular>
              {name}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
