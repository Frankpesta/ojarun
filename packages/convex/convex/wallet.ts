import { customerQuery } from "./lib/auth";

/** The customer's wallet ledger, newest first, for the Wallet tab. */
export const activity = customerQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("walletEntries")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      type: r.type,
      amount: r.amount,
      orderId: r.orderId ?? null,
      note: r.note ?? null,
    }));
  },
});
