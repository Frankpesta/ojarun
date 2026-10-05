import { Tabs } from "expo-router/js-tabs";
import { House, Receipt, User, Wallet } from "phosphor-react-native";
import { FloatingTabBar, tabScreenOptions } from "@/components/TabBar";
import { RoleGuard } from "@/features/auth/RoleGuard";
import { useTheme } from "@/theme/ThemeProvider";

export default function CustomerLayout() {
  const { colors } = useTheme();
  return (
    <RoleGuard role="customer">
      <Tabs screenOptions={tabScreenOptions(colors)} tabBar={(props) => <FloatingTabBar {...props} />}>
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => <House size={24} color={color as string} weight={focused ? "fill" : "regular"} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: "Orders",
            tabBarIcon: ({ color, focused }) => <Receipt size={24} color={color as string} weight={focused ? "fill" : "regular"} />,
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: "Wallet",
            tabBarIcon: ({ color, focused }) => <Wallet size={24} color={color as string} weight={focused ? "fill" : "regular"} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            title: "Account",
            tabBarIcon: ({ color, focused }) => <User size={24} color={color as string} weight={focused ? "fill" : "regular"} />,
          }}
        />
      </Tabs>
    </RoleGuard>
  );
}
