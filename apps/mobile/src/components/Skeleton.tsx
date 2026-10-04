import { useEffect, useState, type ReactNode } from "react";
import { View, type DimensionValue } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { motion } from "@ojarun/ui";

/** A block shaped like the real content; pulses gently. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0.55);

  useEffect(() => {
    if (!reduce) pulse.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [reduce, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  // The pulse and the className live on separate views: NativeWind drops className on animated views.
  return (
    <Animated.View style={[{ width, height }, style]}>
      <View className="flex-1 bg-surface-sunken" style={{ borderRadius: radius }} />
    </Animated.View>
  );
}

/**
 * Shows skeletons only if loading lasts longer than 150 ms, so fast Convex loads never flash
 * (05 §7.4). Renders nothing during the grace period.
 */
export function DelayedSkeleton({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), motion.skeletonDelayMs);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return <View accessibilityLabel="Loading" accessibilityRole="progressbar">{children}</View>;
}
