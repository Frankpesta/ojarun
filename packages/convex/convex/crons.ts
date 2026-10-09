import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/** Convex crons run in UTC; Akure is UTC+1 with no DST (05 §5.6). */
const crons = cronJobs();

crons.daily("generate slots", { hourUTC: 23, minuteUTC: 0 }, internal.slots.generateDaily, {});
crons.interval("expire unpaid orders", { minutes: 5 }, internal.checkout.expireStale, {});
crons.interval("reconcile trader transfers", { minutes: 10 }, internal.transfers.reconcilePending, {});
crons.interval("check paystack balance", { minutes: 30 }, internal.transfers.checkBalance, {});
crons.daily("refresh bank list", { hourUTC: 4, minuteUTC: 0 }, internal.traders.refreshBanks, {});

export default crons;
