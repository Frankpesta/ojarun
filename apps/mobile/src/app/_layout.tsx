import "@/lib/interop";
import { identify, resetIdentity, trackScreen, wrapRoot } from "@/lib/telemetry";
import "../global.css";

import { useEffect, type ReactNode } from "react";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { ToastProvider } from "@/components";
import { config, isConfigured } from "@/lib/config";
import { useMe } from "@/features/auth/useSession";
import { AnimatedSplash, useSplash } from "@/features/splash/AnimatedSplash";

void SplashScreen.preventAutoHideAsync();
// AnimatedSplash draws the same frame underneath, so the native splash can drop instantly.
SplashScreen.setOptions({ duration: 0, fade: false });

const convex = isConfigured ? new ConvexReactClient(config.convexUrl, { unsavedChangesWarning: false }) : null;

function AuthProviders({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <IdentitySync />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

/** Keeps Sentry and PostHog pointed at the signed-in user, and clears them on sign-out. */
function IdentitySync() {
  const { isSignedIn } = useAuth();
  const me = useMe();
  useEffect(() => {
    if (me) identify(me);
    else if (isSignedIn === false) resetIdentity();
  }, [me?._id, me?.role, isSignedIn]);
  return null;
}

function ScreenTracker() {
  const pathname = usePathname();
  useEffect(() => trackScreen(pathname), [pathname]);
  return null;
}

function ThemedStack() {
  const { name, colors } = useTheme();
  return (
    <>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <ScreenTracker />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "fade" }} />
        <Stack.Screen name="(customer)" options={{ animation: "fade" }} />
        <Stack.Screen name="(shopper)" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded && !isConfigured) useSplash.getState().markReady();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProviders>
              <ToastProvider>
                <BottomSheetModalProvider>
                  <ThemedStack />
                </BottomSheetModalProvider>
              </ToastProvider>
            </AuthProviders>
            <AnimatedSplash />
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
