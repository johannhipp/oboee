import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

const skillDocValidator = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  contentMarkdown: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("published")),
});

const computeFeeSplit = (grossAmountBaseUnits: bigint) => {
  const platformFeeBaseUnits = grossAmountBaseUnits / BigInt(100);
  const netAmountBaseUnits = grossAmountBaseUnits - platformFeeBaseUnits;
  return { platformFeeBaseUnits, netAmountBaseUnits };
};

export const recordPurchase = mutation({
  args: {
    skillId: v.id("skills"),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
  },
  returns: v.object({
    purchaseId: v.id("purchases"),
    accessGranted: v.boolean(),
    buyerUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    const buyerUserId = user?._id ?? `agent:${args.challengeId.slice(0, 18)}`;

    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    if (skill.status !== "published") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Skill can only be purchased while published.",
      });
    }

    const existingChallenge = await ctx.db
      .query("purchases")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    if (existingChallenge) {
      throw new ConvexError({
        code: "INVALID_CHALLENGE",
        message: "Challenge has already been consumed.",
      });
    }

    const currencyAddress = args.currencyAddress.trim().toLowerCase();

    const purchaseId = await ctx.db.insert("purchases", {
      skillId: skill._id,
      buyerUserId,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
    });

    const existingGrant = await ctx.db
      .query("accessGrants")
      .withIndex("by_user_skill", (q) => q.eq("userId", buyerUserId).eq("skillId", skill._id))
      .first();
    if (!existingGrant) {
      await ctx.db.insert("accessGrants", {
        userId: buyerUserId,
        skillId: skill._id,
        source: "purchase",
      });
    }

    const { platformFeeBaseUnits, netAmountBaseUnits } = computeFeeSplit(args.amountBaseUnits);
    await ctx.db.insert("payoutEntries", {
      rfsId: skill.rfsId,
      researcherUserId: skill.authorUserId,
      source: "purchase",
      grossAmountBaseUnits: args.amountBaseUnits,
      platformFeeBaseUnits,
      netAmountBaseUnits,
      status: "claimable",
      claimGroupId: undefined,
    });

    await ctx.db.insert("paymentEvents", {
      type: "buy",
      resourceId: skill._id,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      status: "accepted",
    });

    return {
      purchaseId,
      accessGranted: true,
      buyerUserId,
    };
  },
});

export const checkAccess = query({
  args: {
    skillId: v.id("skills"),
  },
  returns: v.object({
    hasAccess: v.boolean(),
    skill: v.union(skillDocValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      return { hasAccess: false, skill: null };
    }

    const viewer = await authComponent.safeGetAuthUser(ctx);
    if (!viewer) {
      return { hasAccess: false, skill };
    }

    if (skill.authorUserId === viewer._id) {
      return { hasAccess: true, skill };
    }

    const grant = await ctx.db
      .query("accessGrants")
      .withIndex("by_user_skill", (q) => q.eq("userId", viewer._id).eq("skillId", skill._id))
      .first();

    return {
      hasAccess: Boolean(grant),
      skill,
    };
  },
});
