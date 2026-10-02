import { ConvexError } from "convex/values";

/**
 * Stable error codes. Clients map these to plain-language copy (05 §7.5);
 * never show raw server messages to customers.
 */
export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  OUTSIDE_DELIVERY_AREA: "OUTSIDE_DELIVERY_AREA",
  SLOT_FULL: "SLOT_FULL",
  SLOT_CLOSED: "SLOT_CLOSED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type AppErrorData = { code: ErrorCode; message: string };

export function appError(code: ErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}

export function isAppError(e: unknown): e is ConvexError<AppErrorData> {
  return (
    e instanceof ConvexError &&
    typeof (e.data as AppErrorData | undefined)?.code === "string"
  );
}
