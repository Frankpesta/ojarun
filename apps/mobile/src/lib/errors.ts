import { ConvexError } from "convex/values";

/**
 * Turn any error into copy a customer can act on (05 §7.5): say what happened and what to do.
 * Never show raw server or SDK messages.
 */
const SERVER_COPY: Record<string, string> = {
  UNAUTHENTICATED: "You've been signed out. Sign in again to continue.",
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  INSUFFICIENT_BALANCE: "There isn't enough in your wallet for that.",
  OUTSIDE_DELIVERY_AREA: "We only deliver within Akure for now. Try an address inside the city.",
  SLOT_FULL: "That delivery time just filled up. Pick another time.",
  SLOT_CLOSED: "Orders for that delivery time have closed. Pick a later time.",
};

const CLERK_COPY: Record<string, string> = {
  form_code_incorrect: "That code isn't right. Check the email and try again.",
  verification_expired: "That code has expired. We can send you a new one.",
  verification_failed: "Too many wrong codes. Wait a minute, then request a new code.",
  too_many_requests: "Too many attempts. Wait a minute and try again.",
  form_param_format_invalid: "That email address doesn't look right.",
  form_identifier_exists: "That email already has an account. Sign in instead.",
  /** Our own code (useEmailAuth): Clerk wants more sign-up fields than the email. */
  sign_up_incomplete: "We couldn't finish creating your account. Please try again later.",
};

export function clerkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as { code?: unknown; errors?: { code?: unknown }[] };
  if (Array.isArray(e.errors) && typeof e.errors[0]?.code === "string") return e.errors[0].code;
  return typeof e.code === "string" ? e.code : undefined;
}

export function friendlyError(error: unknown, fallback = "Something didn't work. Check your connection and try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: string; message?: string } | undefined;
    if (data?.code === "INVALID_INPUT" && data.message) return data.message;
    if (data?.code && SERVER_COPY[data.code]) return SERVER_COPY[data.code]!;
  }
  const clerkCode = clerkErrorCode(error);
  if (clerkCode && CLERK_COPY[clerkCode]) return CLERK_COPY[clerkCode]!;
  // Unmapped errors show the fallback to users; log the real one so it can be mapped.
  if (__DEV__) console.warn("[friendlyError] unmapped error", clerkCode ?? "", error);
  return fallback;
}
