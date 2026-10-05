import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

/** HMAC-SHA512 of the raw body with the Paystack secret key, as lowercase hex. */
export async function paystackSignature(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Paystack webhook (05 §6.1 step 5). Verifies the signature over the raw body, drops repeats,
 * then re-verifies the charge with Paystack in the background and answers 200 straight away.
 */
http.route({
  path: "/paystack/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return new Response("not configured", { status: 503 });

    const body = await request.text();
    const given = (request.headers.get("x-paystack-signature") ?? "").toLowerCase();
    if (!constantTimeEqual(given, await paystackSignature(body, secret))) {
      console.error({ evt: "webhook.bad_signature" });
      return new Response("invalid signature", { status: 401 });
    }

    let payload: { event?: string; data?: { reference?: string } };
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response("bad json", { status: 400 });
    }
    const event = payload.event ?? "";
    const reference = payload.data?.reference ?? "";
    if (!event || !reference) return new Response("ok", { status: 200 });

    const fresh = await ctx.runMutation(internal.checkout.recordWebhook, { key: `${event}:${reference}`, event });
    if (!fresh) return new Response("ok", { status: 200 });

    console.log({ evt: "webhook.received", event, reference });
    if (event === "charge.success" && reference.startsWith("ojr_")) {
      await ctx.scheduler.runAfter(0, internal.checkout.verifyReference, { reference });
    }
    return new Response("ok", { status: 200 });
  }),
});

export default http;
