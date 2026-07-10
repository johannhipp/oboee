import { v } from "convex/values";

import { query } from "./_generated/server";
import { requirePrincipal } from "./lib/principals";

export const myWork = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const [requested, assigned, applications, reviews, actions, obligations] = await Promise.all([
      ctx.db.query("rfs").withIndex("by_author", (query) => query.eq("authorUserId", principal.principalId)).collect(),
      ctx.db.query("rfs").withIndex("by_claimant", (query) => query.eq("claimantUserId", principal.principalId)).collect(),
      ctx.db.query("rfsApplications").withIndex("by_principal", (query) => query.eq("principalId", principal.principalId)).collect(),
      ctx.db.query("reviewAssignments").withIndex("by_reviewer_and_state", (query) => query.eq("reviewerPrincipalId", principal.principalId)).collect(),
      ctx.db.query("humanActionRequests").withIndex("by_owner_and_status", (query) => query.eq("ownerPrincipalId", principal.principalId)).collect(),
      ctx.db.query("settlementObligations").withIndex("by_beneficiary_and_state", (query) => query.eq("beneficiaryPrincipalId", principal.principalId)).collect(),
    ]);
    return { requested: requested.filter((item) => !["cancelled", "fulfilled", "rejected"].includes(item.status)), assigned: assigned.filter((item) => !["fulfilled", "rejected"].includes(item.status)), applications: applications.filter((item) => ["active", "selected", "waitlisted"].includes(item.state)), reviewAssignments: reviews.filter((item) => ["open", "accepted"].includes(item.state)), humanActions: actions.filter((item) => item.status === "pending"), obligations: obligations.filter((item) => item.state !== "settled" && item.state !== "cancelled") };
  },
});

export const myActivity = query({
  args: { afterSequence: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rows = await ctx.db.query("activityEvents").withIndex("by_principal_and_sequence", (query) => query.eq("principalId", principal.principalId).gt("sequence", args.afterSequence ?? 0)).take(Math.min(100, args.limit ?? 50));
    return { items: rows, nextCursor: rows.at(-1)?.sequence ?? args.afterSequence ?? 0 };
  },
});

export const myEarnings = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    return await ctx.db.query("purchasePayoutBatches").withIndex("by_author_and_state", (query) => query.eq("authorPrincipalId", principal.principalId)).collect();
  },
});

export const myReputation = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const [author, reviewer] = await Promise.all([
      ctx.db.query("authorReputationSnapshots").filter((query) => query.eq(query.field("principalId"), principal.principalId)).collect(),
      ctx.db.query("reviewerTrustSnapshots").filter((query) => query.eq(query.field("principalId"), principal.principalId)).collect(),
    ]);
    return { author, reviewer };
  },
});
