import { forwardRef } from "react";
import { Pressable as RNPressable, type PressableProps as RNPressableProps, type View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { cssInterop } from "nativewind";
import { motion } from "@ojarun/ui";

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);
cssInterop(AnimatedPressable, { className: "style" });

export type PressableProps = RNPressableProps & {
  className?: string;
  /** Scale on press. Off for large rows where scaling looks wobbly. */
  scale?: boolean;
};

/** Every tappable surface uses this: scale 0.98 + slight dim over 100 ms (05 §7.4). */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { scale = true, onPressIn, onPressOut, style, disabled, ...rest },
  ref,
) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale ? 1 - (1 - motion.pressScale) * pressed.value : 1 }],
    opacity: 1 - 0.12 * pressed.value,
  }));

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: motion.pressMs });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: motion.pressMs * 1.5 });
        onPressOut?.(e);
      }}
      style={[animatedStyle, style as object]}
      {...rest}
    />
  );
});
