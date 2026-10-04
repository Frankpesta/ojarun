import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { motion, sizes } from "@ojarun/ui";
import { haptic } from "@/lib/haptics";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

export type HoldToConfirmProps = {
  /** e.g. "Hold to send ₦3,000" */
  label: string;
  /** Shown to screen-reader users, who confirm with a double tap instead of holding. */
  accessibleLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: "brand" | "danger";
  size?: "md" | "lg";
};

/**
 * Anything that moves money needs a deliberate 700 ms hold (05 §7.1), with a fill that tracks
 * progress and a heavy haptic at the end. Releasing early rewinds.
 */
export function HoldToConfirm({
  label,
  accessibleLabel,
  onConfirm,
  disabled,
  loading,
  tone = "brand",
  size = "md",
}: HoldToConfirmProps) {
  const progress = useSharedValue(0);
  const [screenReader, setScreenReader] = useState(false);
  const height = size === "lg" ? sizes.shopperButtonHeight : sizes.buttonHeight;
  const inactive = disabled || loading;

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => sub.remove();
  }, []);

  const complete = () => {
    haptic.heavy();
    onConfirm();
  };

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const track = tone === "danger" ? "bg-error" : "bg-brand";

  return (
    <Pressable
      scale={false}
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel ?? label.replace(/^Hold to /i, "")}
      accessibilityHint={screenReader ? "Double tap to confirm" : "Press and hold to confirm"}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={screenReader ? complete : undefined}
      onPressIn={() => {
        if (screenReader || inactive) return;
        haptic.select();
        progress.value = withTiming(1, { duration: motion.holdToConfirmMs, easing: Easing.linear }, (finished) => {
          if (finished) {
            runOnJS(complete)();
            progress.value = withTiming(0, { duration: 250 });
          }
        });
      }}
      onPressOut={() => {
        if (screenReader) return;
        if (progress.value < 1) {
          cancelAnimation(progress);
          progress.value = withTiming(0, { duration: 200 });
        }
      }}
      className={`${track} rounded-button overflow-hidden justify-center ${inactive ? "opacity-40" : ""}`}
      style={{ height }}
    >
      {/* Progress fill: a darker layer sweeping left to right, legible on both tones and themes. */}
      <Animated.View
        style={[fillStyle, { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.22)" }]}
      />
      <View className="items-center justify-center px-4">
        <Text variant="bodyStrong" tone="onBrand" tabular numberOfLines={1}>
          {loading ? "Sending…" : screenReader ? label.replace(/^Hold to /i, "Confirm: ") : label}
        </Text>
      </View>
    </Pressable>
  );
}
