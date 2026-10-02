import type { BottomTabNavigationOptions } from "expo-router/js-tabs";
import type { Theme } from "@ojarun/ui";
import { fontFamily } from "@ojarun/ui";

/** Shared tab styling: calm surface, 1 px top border, brand for the active tab (05 §7.2). */
export function tabScreenOptions(colors: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.inkFaint,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.line,
      borderTopWidth: 1,
      elevation: 0,
      shadowOpacity: 0,
      height: 64,
      paddingTop: 8,
    },
    tabBarLabelStyle: { fontFamily: fontFamily.medium, fontSize: 12, marginBottom: 4 },
    sceneStyle: { backgroundColor: colors.bg },
  };
}
