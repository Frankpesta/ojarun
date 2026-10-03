import type { Role } from "@ojarun/shared";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/** Actions get the same role checks as the query/mutation wrappers (05 §1.4). */
export async function requireCallerInAction(ctx: ActionCtx, roles?: Role[]) {
  return await ctx.runQuery(internal.users.assertCaller, { roles });
}
