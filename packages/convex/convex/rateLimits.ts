import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { raiseAlert } from "./lib/alerts";
import { hit, LIMITS } from "./lib/rateLimit";

/** For actions, which can't write: count a hit for this user and refuse when over the limit. */
export const check = internalMutation({
  args: { userId: v.id("users"), name: v.union(v.literal("resolveAccount"), v.literal("placesSearch")) },
  handler: async (ctx, { userId, name }) => {
    const l = LIMITS[name];
    await hit(ctx, `${name}:${userId}`, l.windowMs, l.max);
  },
});

/** Bad Paystack webhook signatures: more than 3 in 10 minutes pages ops (05 §11). */
export const badSignature = internalMutation({
  args: {},
  handler: async (ctx) => {
    const n = await hit(ctx, "webhook_bad_signature", 10 * 60_000);
    if (n > 3) {
      await raiseAlert(ctx, {
        key: "webhook_bad_signature",
        kind: "paystack_config",
        severity: "critical",
        message: `${n} Paystack webhooks with a bad signature in the last 10 minutes. Someone may be probing the endpoint, or the secret key changed.`,
      });
    }
  },
});
