import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import { Button, Input, Text } from "@/components";
import { friendlyError } from "@/lib/errors";

export default function ProfileSetupScreen() {
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ name, email: email.trim() || undefined });
      router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 px-gutter pt-10 gap-8">
          <View className="gap-2">
            <Text variant="title" accessibilityRole="header">
              What should we call you?
            </Text>
            <Text variant="body" tone="muted">
              Your shopper will see this name when they deliver.
            </Text>
          </View>
          <View className="gap-5">
            <Input
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Adebayo Ojo"
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
            />
            <Input
              label="Email (optional)"
              hint="For receipts. You can add it later."
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text variant="small" tone="error" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="px-gutter pb-4">
          <Button label="Continue" onPress={submit} loading={saving} disabled={name.trim().length < 2} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
