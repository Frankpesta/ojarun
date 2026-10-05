import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { Button, Input, Text } from "@/components";
import { StepBar } from "@/features/auth/StepBar";
import { useMe } from "@/features/auth/useSession";
import { friendlyError } from "@/lib/errors";

export default function ProfileSetupScreen() {
  const me = useMe();
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState(me?.name ?? "");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!normalizeNigerianPhone(phone)) {
      setPhoneError("Enter an 11-digit Nigerian mobile number, like 0803 123 4567.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ name, phone });
      // New customers set a delivery address next; the router sends everyone else on.
      if (me?.role === "customer") router.replace({ pathname: "/address", params: { onboarding: "1" } });
      else router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerClassName="flex-grow px-6 pt-6 pb-6"
      >
        <StepBar step={2} of={3} />
        <View className="mt-7 gap-2.5">
          <Text variant="title" accessibilityRole="header">
            A few details
          </Text>
          <Text variant="body" tone="muted">
            Your shopper sees your name and calls this number when they reach your gate.
          </Text>
        </View>
        <View className="mt-7 gap-5">
          <Input
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Adebayo Ojo"
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            autoFocus={!name}
          />
          <Input
            label="Phone number"
            value={phone}
            onChangeText={(t) => {
              setPhone(t.replace(/[^\d+\s]/g, ""));
              if (phoneError) setPhoneError(null);
            }}
            placeholder="0803 123 4567"
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={phoneError}
            leading={
              <View className="flex-row items-center gap-2 pr-1">
                <View className="flex-row overflow-hidden" style={{ width: 22, height: 15, borderRadius: 3 }}>
                  <View style={{ flex: 1, backgroundColor: "#118A4E" }} />
                  <View style={{ flex: 1, backgroundColor: "#FFFFFF" }} />
                  <View style={{ flex: 1, backgroundColor: "#118A4E" }} />
                </View>
                <Text variant="bodyStrong" tabular>
                  +234
                </Text>
                <View className="h-6 w-px bg-line-strong" />
              </View>
            }
          />
          {error ? (
            <Text variant="small" tone="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label="Continue"
            onPress={submit}
            loading={saving}
            disabled={name.trim().length < 2 || phone.trim().length < 10}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
