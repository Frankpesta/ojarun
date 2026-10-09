import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useMutation } from "convex/react";
import { api } from "@ojarun/convex/api";
import { useMe } from "@/features/auth/useSession";

// Show order updates as banners even when the app is open (the chat screen is live anyway).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Only routes inside the app, never a URL from elsewhere. */
function openFrom(response: Notifications.NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  if (typeof url === "string" && /^\/[A-Za-z0-9/_\-[\]]*$/.test(url)) router.push(url as never);
}

async function expoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#15803D",
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  // Throws until Firebase is set up for this build; push then just stays off.
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

/**
 * Registers this phone for push once someone is signed in, and again whenever the token changes
 * (05 §9 M7). Tapping a notification opens the screen it's about, even from a cold start.
 */
export function PushSetup() {
  const me = useMe();
  const register = useMutation(api.users.registerPushToken);
  const registeredFor = useRef<string | null>(null);
  const signedIn = !!me && me.status === "active";

  useEffect(() => {
    if (!signedIn || registeredFor.current === me!._id) return;
    registeredFor.current = me!._id;
    void expoPushToken()
      .then((token) => (token ? register({ token, platform: Platform.OS }) : undefined))
      .catch((e) => console.warn("Push registration skipped:", e instanceof Error ? e.message : e));
    const sub = Notifications.addPushTokenListener(() => {
      void expoPushToken()
        .then((token) => (token ? register({ token, platform: Platform.OS }) : undefined))
        .catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn, me?._id, register]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!signedIn) return;
    // Opened from a notification while the app was closed.
    void Notifications.getLastNotificationResponseAsync().then(openFrom);
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [signedIn]);

  return null;
}
