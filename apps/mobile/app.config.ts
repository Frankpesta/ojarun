import type { ExpoConfig } from "expo/config";

const APP_ENV = process.env.APP_ENV ?? "development";
const isProd = APP_ENV === "production";

const config: ExpoConfig = {
  name: isProd ? "OjaRun" : `OjaRun (${APP_ENV})`,
  slug: "ojarun",
  scheme: "ojarun",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#FAFAF7",
  android: {
    package: isProd ? "ng.ojarun.app" : `ng.ojarun.app.${APP_ENV}`,
    adaptiveIcon: {
      backgroundColor: "#15803D",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "resize",
  },
  ios: {
    bundleIdentifier: isProd ? "ng.ojarun.app" : `ng.ojarun.app.${APP_ENV}`,
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-web-browser",
    // Android Maps SDK key, restricted to the package name + SHA-1. Set as an EAS secret.
    ["react-native-maps", { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_KEY }],
    [
      // Source maps upload on EAS when SENTRY_AUTH_TOKEN is set as an EAS secret.
      "@sentry/react-native/expo",
      { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT ?? "ojarun-mobile" },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#FAFAF7",
        image: "./assets/splash-icon.png",
        imageWidth: 120,
        dark: { backgroundColor: "#0C1A12", image: "./assets/splash-icon.png" },
      },
    ],
    [
      "expo-font",
      {
        fonts: [
          "../../node_modules/@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf",
          "../../node_modules/@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf",
          "../../node_modules/@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf",
          "../../node_modules/@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf",
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
