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

/**
 * Paystack's callback_url. Sends the payer back into the app, which closes the payment browser
 * and asks the server to verify. The page itself never trusts the query string.
 */
http.route({
  path: "/pay/return",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const reference = new URL(request.url).searchParams.get("reference") ?? "";
    const safe = /^[A-Za-z0-9_-]{1,100}$/.test(reference) ? reference : "";
    const target = `ojarun://pay/return${safe ? `?reference=${safe}` : ""}`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back to OjaRun</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F8F5EE;font-family:system-ui,sans-serif;color:#1A1714}main{text-align:center;padding:24px}a{display:inline-block;margin-top:16px;padding:16px 24px;border-radius:16px;background:#15803D;color:#fff;font-weight:700;text-decoration:none}</style></head><body><main><p>Taking you back to OjaRun…</p><a href="${target}">Return to OjaRun</a></main><script>location.replace(${JSON.stringify(target)})</script></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }),
});

export default http;
