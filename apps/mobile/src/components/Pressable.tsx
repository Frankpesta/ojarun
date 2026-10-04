import { forwardRef } from "react";
import { Pressable as RNPressable, type PressableProps as RNPressableProps, type View } from "react-native";

export type PressableProps = RNPressableProps & {
  className?: string;
  /** Scale on press. Off for large rows where scaling looks wobbly. */
  scale?: boolean;
};

/**
 * Every tappable surface uses this: scale 0.98 + slight dim while pressed (05 §7.4).
 *
 * Plain RN Pressable with NativeWind `active:` classes, not a Reanimated component: NativeWind
 * drops className on Reanimated views that also get an animated style, which left buttons with
 * no background (white label on a cream screen).
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { scale = true, className = "", ...rest },
  ref,
) {
  return (
    <RNPressable
      ref={ref}
      className={`${className} active:opacity-90 ${scale ? "active:scale-[0.98]" : ""}`}
      {...rest}
    />
  );
});
