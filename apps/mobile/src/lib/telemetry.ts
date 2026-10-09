import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import PostHog from "posthog-react-native";
import { config } from "./config";
import { storage } from "./storage";

const appEnv = (Constants.expoConfig?.extra?.appEnv as string | undefined) ?? "development";

/** Both SDKs stay off when their keys are empty, so local dev without accounts just works. */
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: appEnv,
    enabled: !__DEV__,
    tracesSampleRate: appEnv === "production" ? 0.2 : 1,
    // Phone numbers and names stay out of Sentry (05 §1).
    sendDefaultPii: false,
  });
}

export const posthog = config.posthogKey
  ? new PostHog(config.posthogKey, {
      host: config.posthogHost,
      disabled: __DEV__,
      // MMKV is already on board; avoids pulling in async-storage.
      customStorage: {
        getItem: (key) => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    })
  : null;

/** Ties events and crashes to our users row id. Never the phone number. */
export function identify(user: { _id: string; role: string }) {
  Sentry.setUser({ id: user._id });
  Sentry.setTag("role", user.role);
  posthog?.identify(user._id, { role: user.role, appEnv });
}

export function resetIdentity() {
  Sentry.setUser(null);
  posthog?.reset();
}

/** expo-router hides its NavigationContainer, so screens are captured by pathname. */
export function trackScreen(pathname: string) {
  posthog?.screen(pathname);
}

export const wrapRoot = Sentry.wrap;

/**
 * Business events for the PostHog funnels (05 §9 M7). Amounts are kobo; never names, phones or
 * free text.
 */
export type AnalyticsEvent =
  | "order_started"
  | "order_paid"
  | "price_check_sent"
  | "price_check_responded"
  | "item_rejected"
  | "order_completed"
  | "withdrawal_requested";

export function track(event: AnalyticsEvent, props: Record<string, string | number | boolean> = {}) {
  posthog?.capture(event, { ...props, appEnv });
}
