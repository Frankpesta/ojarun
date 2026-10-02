/** Public runtime config. Secrets never live in the app (05 §1.8). */
export const config = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL ?? "",
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
};

export const missingConfig = [
  !config.convexUrl && "EXPO_PUBLIC_CONVEX_URL",
  !config.clerkPublishableKey && "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
].filter(Boolean) as string[];

export const isConfigured = missingConfig.length === 0;
