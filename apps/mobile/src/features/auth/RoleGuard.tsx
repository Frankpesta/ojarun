import type { ReactNode } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";
import type { Role } from "@ojarun/shared";
import { useSession } from "./useSession";

/**
 * Keeps each route group to its role. This is UX only — every Convex function checks the role
 * again on the server (05 §1.4).
 */
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  if (session.status === "loading") return <View className="flex-1 bg-bg" />;
  if (session.status !== "ready" || session.me.role !== role || session.me.status !== "active") {
    return <Redirect href="/" />;
  }
  return <>{children}</>;
}
