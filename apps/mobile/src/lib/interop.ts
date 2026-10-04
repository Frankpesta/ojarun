import Animated from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";

/**
 * NativeWind only maps className on components it knows. Reanimated's animated views aren't
 * registered by default, so register them once at startup (imported first by the root layout).
 */
cssInterop(Animated.View, { className: "style" });
cssInterop(Animated.Text, { className: "style" });
cssInterop(Animated.ScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" });
cssInterop(KeyboardAwareScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" });
