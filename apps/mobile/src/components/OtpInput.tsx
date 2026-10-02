import { forwardRef, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type OtpInputProps = {
  value: string;
  onChange: (code: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  onComplete?: (code: string) => void;
};

/**
 * Six boxes over one hidden field, so SMS autofill and paste work.
 * Shakes once when `error` turns on.
 */
export const OtpInput = forwardRef<TextInput, OtpInputProps>(function OtpInput(
  { value, onChange, length = 6, error, autoFocus, onComplete },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (error) {
      shake.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 70 }),
        withTiming(-4, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      );
    }
  }, [error, shake]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Pressable scale={false} onPress={() => inputRef.current?.focus()} accessible={false}>
      <Animated.View style={style} className="flex-row justify-between gap-2">
        {Array.from({ length }, (_, i) => {
          const char = value[i] ?? "";
          const active = focused && (i === value.length || (i === length - 1 && value.length === length));
          const borderColor = error ? colors.error : active ? colors.brand : colors.lineStrong;
          return (
            <View
              key={i}
              className="flex-1 items-center justify-center rounded-input bg-surface"
              style={{ height: 60, borderWidth: active || error ? 2 : 1, borderColor }}
            >
              <Text variant="title" tabular>
                {char}
              </Text>
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={(r) => {
          inputRef.current = r;
          if (typeof ref === "function") ref(r);
          else if (ref) ref.current = r;
        }}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, "").slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        accessibilityLabel="Verification code"
        accessibilityHint={`Enter the ${length}-digit code from the SMS`}
        caretHidden
        className="absolute inset-0 opacity-0"
      />
    </Pressable>
  );
});
