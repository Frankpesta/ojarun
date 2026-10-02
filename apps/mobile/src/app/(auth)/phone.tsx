import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { Button, Input, Text } from "@/components";
import { Wordmark } from "@/components/Wordmark";
import { usePhoneAuth } from "@/features/auth/usePhoneAuth";
import { friendlyError } from "@/lib/errors";

export default function PhoneScreen() {
  const { sendCode } = usePhoneAuth();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const phone = normalizeNigerianPhone(raw);

  const submit = async () => {
    if (!phone) {
      setError("Enter an 11-digit Nigerian mobile number, like 0803 123 4567.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await sendCode(phone);
      if ("error" in res) setError(friendlyError(res.error, "We couldn't send the code. Check the number and try again."));
      else router.push({ pathname: "/verify", params: { phone, mode: res.mode } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 px-gutter pt-10">
          <Wordmark />
          <View className="mt-12 gap-2">
            <Text variant="title" accessibilityRole="header">
              What's your phone number?
            </Text>
            <Text variant="body" tone="muted">
              We'll text you a 6-digit code to sign in. New here? The same code creates your account.
            </Text>
          </View>
          <View className="mt-8">
            <Input
              label="Phone number"
              value={raw}
              onChangeText={(t) => {
                setRaw(t.replace(/[^\d+\s]/g, ""));
                if (error) setError(null);
              }}
              placeholder="0803 123 4567"
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel"
              textContentType="telephoneNumber"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={submit}
              error={error}
              leading={
                <View className="flex-row items-center gap-2 pr-1">
                  <Text variant="bodyStrong" tabular>
                    +234
                  </Text>
                  <View className="h-6 w-px bg-line-strong" />
                </View>
              }
            />
          </View>
        </View>
        <View className="px-gutter pb-4 gap-3">
          <Button label="Send code" onPress={submit} loading={sending} disabled={raw.trim().length < 10} />
          <Text variant="caption" tone="muted">
            By continuing you agree to OjaRun's Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
