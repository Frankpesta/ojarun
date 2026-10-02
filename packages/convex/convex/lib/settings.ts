import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "@ojarun/shared";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Current settings, merged over defaults so newly added knobs work before ops saves them. */
export async function getSettings(ctx: QueryCtx | MutationCtx): Promise<Settings> {
  const row = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
  if (!row) return DEFAULT_SETTINGS;
  return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...(row.value as object) });
}
