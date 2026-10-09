import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { normalizeNigerianPhone } from "@ojarun/shared";
import { getSettings } from "./lib/settings";

/**
 * Delivers an outbox row on each channel (05 §9 M7). Push goes through Expo's push service
 * (no key needed on our side). SMS (Termii) and email (Resend) run only when their keys are set;
 * otherwise the channel is marked "skipped: not configured" and nothing leaves the server.
 */

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";
const TERMII = "https://api.ng.termii.com/api/sms/send";
const RESEND = "https://api.resend.com/emails";

export const load = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const n = await ctx.db.get(notificationId);
    if (!n) return null;
    if (n.audience === "ops") {
      const s = await getSettings(ctx);
      return { n, tokens: [] as { _id: Id<"pushTokens">; token: string }[], phone: normalizeNigerianPhone(s.opsAlertPhone) ?? null, email: s.opsAlertEmail.trim() || null };
    }
    const user = n.userId ? await ctx.db.get(n.userId) : null;
    if (!user || user.status !== "active") return { n, tokens: [], phone: null, email: null };
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return { n, tokens: tokens.map((t) => ({ _id: t._id, token: t.token })), phone: user.phone ?? null, email: user.email ?? null };
  },
});

export const record = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    channels: v.object({ push: v.optional(v.string()), sms: v.optional(v.string()), email: v.optional(v.string()) }),
    deadTokens: v.array(v.id("pushTokens")),
  },
  handler: async (ctx, { notificationId, channels, deadTokens }) => {
    const n = await ctx.db.get(notificationId);
    if (n) await ctx.db.patch(notificationId, { channels: { ...n.channels, ...channels } });
    for (const id of deadTokens) if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

async function sendPush(tokens: { _id: Id<"pushTokens">; token: string }[], n: { title: string; body: string; url?: string }) {
  if (tokens.length === 0) return { status: "skipped: no device", dead: [] as Id<"pushTokens">[] };
  const res = await fetch(EXPO_PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: n.title,
        body: n.body,
        data: n.url ? { url: n.url } : {},
        sound: "default",
        priority: "high",
        channelId: "default",
      })),
    ),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
  const tickets = json.data ?? [];
  const dead = tickets.flatMap((t, i) => (t.details?.error === "DeviceNotRegistered" ? [tokens[i]!._id] : []));
  const ok = tickets.filter((t) => t.status === "ok").length;
  return { status: res.ok ? `sent ${ok}/${tokens.length}` : `failed: HTTP ${res.status}`, dead };
}

async function sendSms(phone: string | null, text: string): Promise<string> {
  const key = process.env.TERMII_API_KEY;
  if (!key) return "skipped: not configured";
  if (!phone) return "skipped: no phone";
  const res = await fetch(TERMII, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: phone.replace(/^\+/, ""),
      from: process.env.TERMII_SENDER_ID ?? "OjaRun",
      sms: text.slice(0, 300),
      type: "plain",
      channel: "generic",
      api_key: key,
    }),
  });
  return res.ok ? "sent" : `failed: HTTP ${res.status}`;
}

async function sendEmail(to: string | null, email: { subject: string; html: string }): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "skipped: not configured";
  if (!to) return "skipped: no email";
  const res = await fetch(RESEND, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "OjaRun <onboarding@resend.dev>", to: [to], subject: email.subject, html: email.html }),
  });
  return res.ok ? "sent" : `failed: HTTP ${res.status}`;
}

export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const loaded = await ctx.runQuery(internal.notifications.load, { notificationId });
    if (!loaded) return;
    const { n, tokens, phone, email } = loaded;
    const channels: { push?: string; sms?: string; email?: string } = {};
    let dead: Id<"pushTokens">[] = [];

    const attempt = async (fn: () => Promise<string>) => {
      try {
        return await fn();
      } catch (e) {
        return `failed: ${String(e).slice(0, 80)}`;
      }
    };
    if (n.channels.push === "queued") {
      channels.push = await attempt(async () => {
        const r = await sendPush(tokens, n);
        dead = r.dead;
        return r.status;
      });
    }
    if (n.channels.sms === "queued") channels.sms = await attempt(() => sendSms(phone, `${n.title}. ${n.body}`));
    if (n.channels.email === "queued" && n.email) channels.email = await attempt(() => sendEmail(email, n.email!));

    console.log({ evt: "notify", event: n.event, audience: n.audience, ...channels });
    await ctx.runMutation(internal.notifications.record, { notificationId, channels, deadTokens: dead });
  },
});
