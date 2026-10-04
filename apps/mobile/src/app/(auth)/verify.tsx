import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { CaretLeft } from "phosphor-react-native";
import { Button, OtpInput, Pressable, Text, useToast } from "@/components";
import { useEmailAuth, type AuthMode } from "@/features/auth/useEmailAuth";
import { friendlyError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";

const RESEND_AFTER_SEC = 30;

export default function VerifyScreen() {
  const { email, mode } = useLocalSearchParams<{ email: string; mode: AuthMode }>();
  const { verify, resendCode } = useEmailAuth();
  const { colors } = useTheme();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER_SEC);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (value = code) => {
    if (value.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await verify(mode, value);
      if (res) {
        haptic.error();
        setError(friendlyError(res.error, "That code didn't work. Try again or request a new one."));
        setCode("");
      } else {
        haptic.success();
        router.replace("/");
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setWait(RESEND_AFTER_SEC);
    const res = await resendCode(mode);
    if (res) toast.show({ message: friendlyError(res.error, "We couldn't resend the code. Try again shortly."), tone: "error" });
    else toast.show({ message: `New code sent to ${email}.`, tone: "success" });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        contentContainerClassName="flex-grow px-gutter pb-6"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Change email"
          className="-ml-3 mt-2 h-11 w-11 items-center justify-center"
        >
          <CaretLeft size={22} color={colors.ink} weight="bold" />
        </Pressable>

        <View className="mt-6 gap-2">
          <Text variant="title" accessibilityRole="header">
            Check your email
          </Text>
          <Text variant="body" tone="muted">
            We sent a 6-digit code to <Text variant="bodyStrong">{email}</Text>. It can take a minute to arrive, so
            check spam too.
          </Text>
        </View>

        <View className="mt-8 gap-3">
          <OtpInput
            value={code}
            onChange={(c) => {
              setCode(c);
              if (error) setError(null);
            }}
            onComplete={(c) => void submit(c)}
            error={!!error}
            autoFocus
          />
          {error ? (
            <Text variant="small" tone="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>

        <View className="mt-6">
          <Button label="Continue" onPress={() => void submit()} loading={verifying} disabled={code.length !== 6} />
        </View>

        <View className="mt-4 flex-row items-center justify-center gap-1">
          <Text variant="small" tone="muted">
            Didn't get it?
          </Text>
          {wait > 0 ? (
            <Text variant="small" tone="muted" tabular>
              Resend in 0:{wait.toString().padStart(2, "0")}
            </Text>
          ) : (
            <Pressable onPress={resend} accessibilityRole="button" className="py-2">
              <Text variant="smallStrong" tone="brand">
                Resend code
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
