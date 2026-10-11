import Animated from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";

/**
 * NativeWind only maps className on components it knows; register extras once at startup
 * (imported first by the root layout).
 *
 * Animated.View is deliberately NOT registered: with Reanimated 4 the interop wrapper dropped
 * className AND the static half of style arrays like [StyleSheet.absoluteFill, animatedStyle]
 * (the splash rendered unpositioned). Put static styles in style, and className on an inner View.
 */
cssInterop(Animated.Text, { className: "style" });
cssInterop(Animated.ScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" });
cssInterop(KeyboardAwareScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" });
