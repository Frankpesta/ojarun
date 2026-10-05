import { useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useAction, useConvex, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "@ojarun/convex/api";
import type { Id } from "@ojarun/convex/dataModel";

type CreateArgs = FunctionArgs<typeof api.orders.create>;

export type PayResult =
  | { kind: "paid"; orderId: Id<"orders"> }
  | { kind: "unfinished"; orderId: Id<"orders"> };

const RETURN_URL = "ojarun://pay/return";

/**
 * Checkout steps 1–4 (05 §6.1). The order is created once per checkout; tapping Pay again after
 * closing Paystack starts a new attempt on the same order instead of a second order. The server
 * decides whether it's paid: the browser closing only asks it to check now.
 */
export function usePayment() {
  const convex = useConvex();
  const createOrder = useMutation(api.orders.create);
  const initPayment = useAction(api.checkout.initPayment);
  const verify = useAction(api.checkout.verifyAndApply);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ orderId: Id<"orders">; signature: string } | null>(null);

  const pay = async (args: Omit<CreateArgs, "clientRequestId">): Promise<PayResult> => {
    setBusy(true);
    try {
      // Same choices as the unpaid order we already made? Pay for that one.
      const signature = JSON.stringify(args);
      let orderId = pending.current?.signature === signature ? pending.current.orderId : null;
      if (orderId) {
        const existing = await convex.query(api.orders.get, { orderId });
        if (existing?.status === "paid") return { kind: "paid", orderId };
        if (existing?.status !== "pending_payment" || existing.holdExpiresAt <= Date.now()) orderId = null;
      }
      if (!orderId) {
        const created = await createOrder({ ...args, clientRequestId: Crypto.randomUUID() });
        if (created.status === "paid") return { kind: "paid", orderId: created.orderId };
        orderId = created.orderId;
        pending.current = { orderId, signature };
      }

      const { authorizationUrl, reference } = await initPayment({ orderId });
      await WebBrowser.openAuthSessionAsync(authorizationUrl, RETURN_URL);
      const status = await verify({ reference }).catch(() => "unknown");
      if (status === "success") {
        pending.current = null;
        return { kind: "paid", orderId };
      }
      // The webhook may still land; check what the server has before calling it unfinished.
      const latest = await convex.query(api.orders.get, { orderId });
      if (latest?.status === "paid") {
        pending.current = null;
        return { kind: "paid", orderId };
      }
      return { kind: "unfinished", orderId };
    } finally {
      setBusy(false);
    }
  };

  return { pay, busy };
}
