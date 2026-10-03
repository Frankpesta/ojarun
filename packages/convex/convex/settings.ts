import { v } from "convex/values";
import { settingsSchema } from "@ojarun/shared";
import { authedQuery, opsMutation, opsQuery } from "./lib/auth";
import { audit } from "./lib/audit";
import { appError, ErrorCode } from "./lib/errors";
import { getSettings } from "./lib/settings";

/** The subset of settings customers and shoppers need. */
export const publicSettings = authedQuery({
  args: {},
  handler: async (ctx) => {
    const s = await getSettings(ctx);
    return {
      serviceFeeKobo: s.serviceFeeKobo,
      bufferPresets: s.bufferPresets,
      defaultBufferPct: s.defaultBufferPct,
      minWithdrawalKobo: s.minWithdrawalKobo,
      refundPaystackChargeOnCancel: s.refundPaystackChargeOnCancel,
      priceCheckTimeoutSec: s.priceCheckTimeoutSec,
      showPriceGuide: s.showPriceGuide,
      supportWhatsapp: s.supportWhatsapp,
      supportPhone: s.supportPhone,
      /** For live "outside our area" feedback while placing a pin; the server re-checks on save. */
      geofence: s.geofence,
    };
  },
});

export const get = opsQuery({
  args: {},
  handler: async (ctx) => getSettings(ctx),
});

export const update = opsMutation({
  args: { value: v.any(), reason: v.string() },
  handler: async (ctx, { value, reason }) => {
    const parsed = settingsSchema.safeParse(value);
    if (!parsed.success) {
      throw appError(ErrorCode.INVALID_INPUT, parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; "));
    }
    const before = await getSettings(ctx);
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    await audit(ctx, {
      actorId: ctx.user._id,
      action: "settings.update",
      targetTable: "settings",
      targetId: row?._id ?? "global",
      reason,
      before,
      after: parsed.data,
    });
    if (row) await ctx.db.patch(row._id, { value: parsed.data });
    else await ctx.db.insert("settings", { key: "global", value: parsed.data });
  },
});
