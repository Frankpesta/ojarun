import { Tabs } from "expo-router/js-tabs";
import { CalendarCheck, CloudArrowUp, User } from "phosphor-react-native";
import { FloatingTabBar, tabScreenOptions } from "@/components/TabBar";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { QueueRunner } from "@/features/shopper/QueueRunner";
import { useTheme } from "@/theme/ThemeProvider";

export default function ShopperLayout() {
  const { colors } = useTheme();
  return (
    <RoleGuard role="shopper">
      <QueueRunner />
      <Tabs screenOptions={tabScreenOptions(colors)} tabBar={(props) => <FloatingTabBar {...props} />}>
        <Tabs.Screen
          name="today"
          options={{
            title: "Today",
            tabBarIcon: ({ color, focused }) => (
              <CalendarCheck size={24} color={color as string} weight={focused ? "fill" : "regular"} />
            ),
          }}
        />
        <Tabs.Screen
          name="queue"
          options={{
            title: "Uploads",
            tabBarIcon: ({ color, focused }) => (
              <CloudArrowUp size={24} color={color as string} weight={focused ? "fill" : "regular"} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, focused }) => <User size={24} color={color as string} weight={focused ? "fill" : "regular"} />,
          }}
        />
      </Tabs>
    </RoleGuard>
  );
}
