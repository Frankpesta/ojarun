import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { BackButton, Button, Input, Text } from "@/components";
import { useEmailAuth } from "@/features/auth/useEmailAuth";
import { friendlyError } from "@/lib/errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailScreen() {
  const { sendCode } = useEmailAuth();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const email = raw.trim().toLowerCase();

  const submit = async () => {
    if (!EMAIL.test(email)) {
      setError("Enter a valid email address, like ade@example.com.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await sendCode(email);
      if ("error" in res) setError(friendlyError(res.error, "We couldn't send the code. Check the address and try again."));
      else router.push({ pathname: "/verify", params: { email, mode: res.mode } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerClassName="flex-grow px-6 pt-2 pb-6"
      >
        <BackButton />
        <View className="mt-6 gap-2.5">
          <Text variant="title" accessibilityRole="header">
            What's your email?
          </Text>
          <Text variant="body" tone="muted">
            We'll send a 6-digit code. No password to remember. New here? The same code sets up your account.
          </Text>
        </View>
        <View className="mt-8 gap-4">
          <Input
            label="Email address"
            value={raw}
            onChangeText={(t) => {
              setRaw(t);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            autoFocus
            error={error}
          />
          <Button label="Send code" onPress={submit} loading={sending} disabled={!email} />
        </View>
        <Text variant="small" tone="faint" className="mt-auto pt-8 text-center">
          By continuing you agree to OjaRun's Terms of Service and Privacy Policy.
        </Text>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
