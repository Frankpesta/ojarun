import { useNetInfo } from "@react-native-community/netinfo";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { WifiSlash } from "phosphor-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** Slim, non-blocking banner (05 §7.4). Place it at the bottom of a screen, above the tab bar. */
export function OfflineBanner({ message = "You're offline. We'll send this when you're back." }: { message?: string }) {
  const { isConnected, isInternetReachable } = useNetInfo();
  const { colors } = useTheme();
  const offline = isConnected === false || isInternetReachable === false;
  if (!offline) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      className="mx-4 mb-2 flex-row items-center gap-2 rounded-input bg-surface-sunken px-3 py-2"
    >
      <WifiSlash size={16} color={colors.inkMuted} />
      <Text variant="small" tone="muted" className="flex-1">
        {message}
      </Text>
    </Animated.View>
  );
}
