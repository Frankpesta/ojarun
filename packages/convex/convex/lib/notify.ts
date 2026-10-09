import { formatNaira } from "@ojarun/shared";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Notifications (doc 02 §13, 05 §9 M7). Callers describe the event inside their own mutation;
 * a row goes into the outbox and an action delivers it after the mutation commits, so a
 * rolled-back change never notifies anyone. Deduped on a key, so retries don't double-send.
 */

type Message = {
  event: string;
  title: string;
  body: string;
  url?: string;
  orderId?: Id<"orders">;
  /** Also by SMS (Termii): only for events that can't wait (price check, en route, arrived). */
  sms?: boolean;
  email?: { subject: string; html: string };
  dedupeKey: string;
};

export async function notifyUser(ctx: MutationCtx, userId: Id<"users">, m: Message): Promise<void> {
  const seen = await ctx.db
    .query("notifications")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", m.dedupeKey))
    .first();
  if (seen) return;
  const id = await ctx.db.insert("notifications", {
    userId,
    audience: "user",
    event: m.event,
    title: m.title,
    body: m.body,
    url: m.url,
    orderId: m.orderId,
    channels: { push: "queued", sms: m.sms ? "queued" : undefined, email: m.email ? "queued" : undefined },
    email: m.email,
    dedupeKey: m.dedupeKey,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { notificationId: id });
}

/** Critical ops alerts to the on-call phone and email from settings (05 §11). */
export async function notifyOps(ctx: MutationCtx, m: { event: string; title: string; body: string; dedupeKey: string }): Promise<void> {
  const seen = await ctx.db
    .query("notifications")
    .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", m.dedupeKey))
    .first();
  if (seen) return;
  const id = await ctx.db.insert("notifications", {
    audience: "ops",
    event: m.event,
    title: m.title,
    body: m.body,
    channels: { sms: "queued", email: "queued" },
    email: { subject: `[OjaRun ops] ${m.title}`, html: shell(`<p style="margin:0 0 12px">${esc(m.body)}</p>`) },
    dedupeKey: m.dedupeKey,
  });
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { notificationId: id });
}

const first = (u: Doc<"users"> | null, fallback: string) => u?.name?.split(/\s+/)[0] ?? fallback;

/** The customer-facing order events, worded once (05 §7.5). */
export async function notifyOrderEvent(
  ctx: MutationCtx,
  order: Doc<"orders">,
  event: "payment_confirmed" | "shopper_assigned" | "shopping_started" | "en_route" | "arrived",
): Promise<void> {
  const [shopper, market] = await Promise.all([order.shopperId ? ctx.db.get(order.shopperId) : null, ctx.db.get(order.marketId)]);
  const name = first(shopper, "Your shopper");
  const where = market?.name ?? "the market";
  const url = event === "arrived" ? `/door/${order._id}` : `/order/${order._id}`;
  const copy = {
    payment_confirmed: { title: "Order confirmed", body: `We'll shop at ${where} for you. We'll tell you when your shopper starts.` },
    shopper_assigned: { title: `${name} is your shopper`, body: `Shopping starts soon at ${where}.` },
    shopping_started: { title: `${name} started shopping`, body: "Follow along live. If anything costs more, you'll get a price check." },
    en_route: { title: `${name} is on the way`, body: "Your shopping is coming. Keep your phone close." },
    arrived: { title: `${name} is at your door`, body: "Check your items in the app, then accept the delivery." },
  }[event];
  await notifyUser(ctx, order.customerId, {
    event,
    ...copy,
    url,
    orderId: order._id,
    sms: event === "en_route" || event === "arrived",
    email: event === "payment_confirmed" ? { subject: `OjaRun order confirmed`, html: paymentReceiptHtml(order, where) } : undefined,
    dedupeKey: `${event}:${order._id}`,
  });
}

// ---------------------------------------------------------------------------------------------
// Email templates: plain, inline-styled HTML that renders in Gmail and on phones.
// ---------------------------------------------------------------------------------------------

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F8F5EE;font-family:Arial,Helvetica,sans-serif;color:#1A1714"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;border:1px solid #ECE6DA"><tr><td style="background:#0B3B22;border-radius:16px 16px 0 0;padding:20px 24px;font-size:20px;font-weight:bold;color:#FFFFFF"><span style="color:#4ADE80">Oja</span>Run</td></tr><tr><td style="padding:24px;font-size:15px;line-height:22px">${inner}</td></tr><tr><td style="padding:0 24px 24px;font-size:12px;color:#6B645C">OjaRun · Akure. Questions? Reply to this email or use Help in the app.</td></tr></table></td></tr></table></body></html>`;
}

function row(label: string, value: string, strong = false): string {
  const w = strong ? "bold" : "normal";
  return `<tr><td style="padding:6px 0;color:#5C554D;font-weight:${w}">${esc(label)}</td><td align="right" style="padding:6px 0;font-weight:${w}">${esc(value)}</td></tr>`;
}

function paymentReceiptHtml(order: Doc<"orders">, market: string): string {
  const t = order.totals;
  return shell(
    `<p style="margin:0 0 4px;font-size:20px;font-weight:bold">Order confirmed</p><p style="margin:0 0 16px;color:#5C554D">Your shopper buys at ${esc(market)}. Unspent money comes back to your wallet after delivery.</p><table role="presentation" width="100%">` +
      row("Item budgets", formatNaira(t.budgets)) +
      (t.buffer ? row("Buffer for price changes", formatNaira(t.buffer)) : "") +
      row("Service fee", formatNaira(t.serviceFee)) +
      row("Delivery", formatNaira(t.deliveryFee)) +
      (t.paystackCharge ? row("Paystack charge", formatNaira(t.paystackCharge)) : "") +
      (t.walletApplied ? row("From your wallet", `−${formatNaira(t.walletApplied)}`) : "") +
      row("Paid", formatNaira(t.chargeAmount + t.walletApplied), true) +
      `</table>`,
  );
}

export function finalReceiptHtml(input: {
  market: string;
  items: { name: string; status: string; amountSpent: number }[];
  paid: number;
  leftover: number;
  rejection: number;
}): string {
  const lines = input.items
    .map((i) =>
      row(
        `${i.name}${i.status === "rejected" ? " (rejected)" : i.status === "skipped" ? " (not available)" : ""}`,
        i.status === "skipped" ? "—" : formatNaira(i.amountSpent),
      ),
    )
    .join("");
  const back = input.leftover + input.rejection;
  return shell(
    `<p style="margin:0 0 4px;font-size:20px;font-weight:bold">Delivered</p><p style="margin:0 0 16px;color:#5C554D">Thanks for shopping ${esc(input.market)} with OjaRun.</p><table role="presentation" width="100%">${lines}</table><hr style="border:none;border-top:1px solid #ECE6DA;margin:12px 0"><table role="presentation" width="100%">` +
      row("You paid", formatNaira(input.paid)) +
      (input.leftover ? row("Change and unused buffer", `−${formatNaira(input.leftover)}`) : "") +
      (input.rejection ? row("Refund for rejected items", `−${formatNaira(input.rejection)}`) : "") +
      row("Back in your wallet", formatNaira(back), true) +
      `</table>`,
  );
}
