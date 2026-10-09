import { appError, ErrorCode } from "./errors";

const PAYSTACK = "https://api.paystack.co";

export type PaystackResult = {
  status: boolean;
  httpStatus: number;
  message?: string;
  data?: unknown;
  meta?: { next?: string | null };
};

/**
 * True in development when no Paystack key is set: bank lookups, transfers and the balance check
 * are simulated so the shopper flow can be demoed end to end. Never true in production.
 */
export function paystackSimulated(): boolean {
  return !process.env.PAYSTACK_SECRET_KEY && process.env.APP_ENV === "development";
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw appError(ErrorCode.UNAVAILABLE, "Payments aren't available right now. Try again shortly.");
  return key;
}

/**
 * One Paystack API call. Throws UNAVAILABLE only when Paystack can't be reached at all; every
 * answer it gives, good or bad, comes back as a result so callers can tell "refused" from "unknown".
 */
export async function paystack(path: string, init: RequestInit = {}): Promise<PaystackResult> {
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw appError(ErrorCode.UNAVAILABLE, "We couldn't reach Paystack. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => ({}))) as Omit<PaystackResult, "httpStatus" | "status"> & { status?: boolean };
  if (!res.ok || !body.status) {
    console.error({ evt: "paystack.error", path: path.split("?")[0], status: res.status, message: body.message });
  }
  return { status: res.ok && !!body.status, httpStatus: res.status, message: body.message, data: body.data, meta: body.meta };
}
