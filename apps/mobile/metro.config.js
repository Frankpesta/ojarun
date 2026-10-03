const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// Expo configures Metro for monorepos automatically (SDK 52+); no watchFolders needed.
// The Sentry wrapper is Expo's default config plus debug IDs for source maps.
const config = getSentryExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
