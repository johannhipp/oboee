import type { MutationCtx } from "../_generated/server";

export const recordPrincipalActivity = async (
  ctx: MutationCtx,
  args: { principalId: string; role: string; resourceType: string; resourceId: string; eventType: string; publicSummary: string; capabilityReference?: string; occurredAt?: number },
) => {
  const prior = await ctx.db.query("activityEvents").withIndex("by_principal_and_sequence", (query) => query.eq("principalId", args.principalId)).order("desc").first();
  return await ctx.db.insert("activityEvents", { ...args, sequence: (prior?.sequence ?? 0) + 1, occurredAt: args.occurredAt ?? Date.now() });
};
