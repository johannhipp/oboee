import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";

export const requirePolicyV2Enabled = async (
  ctx: MutationCtx | QueryCtx,
  principalId: string,
) => {
  const flag = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (query) => query.eq("key", "policy_v2"))
    .unique();
  if (
    !flag ||
    (flag.mode !== "on" && !(flag.mode === "cohort" && flag.cohortIds.includes(principalId)))
  ) {
    throw new ConvexError({
      code: "POLICY_V2_DISABLED",
      message: "Policy v2 is not enabled for this principal.",
    });
  }
  return flag;
};
