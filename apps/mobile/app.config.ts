import type { ExpoConfig } from "expo/config";

const APP_ENV = process.env.APP_ENV ?? "development";
const isProd = APP_ENV === "production";

const config: ExpoConfig = {
  name: isProd ? "OjaRun" : `OjaRun (${APP_ENV})`,
  slug: "ojarun",
  owner: "pesta_02",
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
        // Native frame only: the green basket tile on forest. src/features/splash/AnimatedSplash
        // takes over from the identical layout and plays the full splash.
        backgroundColor: "#0B3B22",
        image: "./assets/splash-icon.png",
        imageWidth: 124,
        dark: { backgroundColor: "#0B3B22", image: "./assets/splash-icon.png" },
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
          "../../node_modules/@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf",
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    // Not a secret: identifies the project on expo.dev (@pesta_02/ojarun).
    eas: { projectId: "160f5d57-3dd8-4bb3-b179-a3d97d221620" },
  },
};

export default config;
