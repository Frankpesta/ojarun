import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/** Convex crons run in UTC; Akure is UTC+1 with no DST (05 §5.6). */
const crons = cronJobs();

crons.daily("generate slots", { hourUTC: 23, minuteUTC: 0 }, internal.slots.generateDaily, {});
crons.interval("expire unpaid orders", { minutes: 5 }, internal.checkout.expireStale, {});

export default crons;
