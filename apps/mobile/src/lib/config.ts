/** Public runtime config. Secrets never live in the app (05 §1.8). */
export const config = {
  convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL ?? "",
  clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  /** Optional: telemetry is skipped when these are empty. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "",
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
};

export const missingConfig = [
  !config.convexUrl && "EXPO_PUBLIC_CONVEX_URL",
  !config.clerkPublishableKey && "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
].filter(Boolean) as string[];

export const isConfigured = missingConfig.length === 0;
