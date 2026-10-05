import { router } from "expo-router";
import { ArrowLeft } from "phosphor-react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Pressable } from "./Pressable";

/** Plain back arrow for full-screen flows. `floating` adds a white tile for use over a map or photo. */
export function BackButton({
  label = "Back",
  onPress,
  floating,
  tone = "ink",
}: {
  label?: string;
  onPress?: () => void;
  floating?: boolean;
  tone?: "ink" | "onForest";
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={floating ? "items-center justify-center rounded-2xl bg-surface" : "-ml-2.5 items-center justify-center"}
      style={[
        { width: floating ? 48 : 44, height: floating ? 48 : 44 },
        floating
          ? { shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
          : null,
      ]}
    >
      <ArrowLeft size={24} color={tone === "onForest" ? colors.onForest : colors.ink} weight="bold" />
    </Pressable>
  );
}
