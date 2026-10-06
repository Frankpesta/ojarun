import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps, BottomTabNavigationOptions } from "expo-router/js-tabs";
import type { Theme } from "@ojarun/ui";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Pressable } from "./Pressable";
import { Text } from "./Text";

const BAR_HEIGHT = 68;
const BAR_GAP = 12;

/** Space a tab screen's scroll content needs at the bottom so the floating bar never covers it. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + BAR_GAP + Math.max(insets.bottom, 12) + 16;
}

export function tabScreenOptions(colors: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    sceneStyle: { backgroundColor: colors.bg },
  };
}

/** Floating forest-green pill: icon and label on every tab, the current one on a mint highlight. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(insets.bottom, 12) + BAR_GAP }}
    >
      <View
        accessibilityRole="tablist"
        className="flex-row bg-forest"
        style={{
          height: BAR_HEIGHT,
          borderRadius: 26,
          padding: 6,
          gap: 4,
          shadowColor: "#0B3B22",
          shadowOpacity: 0.35,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 12 },
          elevation: 12,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === index;
          const label = typeof options.title === "string" ? options.title : route.name;
          const color = focused ? colors.forest : colors.forestMuted;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptic.select();
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              scale={false}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarBadge !== undefined ? `${label}, ${options.tabBarBadge} waiting` : label}
              onPress={onPress}
              className={`flex-1 items-center justify-center gap-0.5 ${focused ? "bg-forest-active" : ""}`}
              style={{ borderRadius: 20 }}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              {options.tabBarBadge !== undefined ? (
                <View
                  className="absolute items-center justify-center rounded-full bg-accent px-1"
                  style={{ top: 6, left: "58%", minWidth: 18, height: 18 }}
                  accessibilityElementsHidden
                >
                  <Text variant="caption" tone="onAccent" style={{ fontSize: 11 }} className="font-extrabold">
                    {options.tabBarBadge}
                  </Text>
                </View>
              ) : null}
              <Text variant="caption" style={{ color, fontSize: 11 }} className={focused ? "font-extrabold" : ""}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
