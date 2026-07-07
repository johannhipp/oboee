import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

const skillStatusValidator = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("evaluation_open"),
  v.literal("accepted"),
  v.literal("revision_requested"),
  v.literal("disputed"),
  v.literal("rejected"),
  v.literal("published"),
);

const skillDocValidator = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  contentMarkdown: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  latestVersion: v.optional(v.number()),
  latestContentHash: v.optional(v.string()),
  status: skillStatusValidator,
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
    skillVersion: v.union(
      v.object({
        version: v.number(),
        contentHash: v.string(),
        evaluationDeadline: v.number(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      return { hasAccess: false, skill: null, skillVersion: null };
    }

    const versions = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill", (q) => q.eq("skillId", skill._id))
      .collect();
    const latestVersion = versions.sort((a, b) => b.version - a.version)[0];
    const skillVersion = latestVersion
      ? {
          version: latestVersion.version,
          contentHash: latestVersion.contentHash,
          evaluationDeadline: latestVersion.evaluationDeadline,
        }
      : null;

    const viewer = await authComponent.safeGetAuthUser(ctx);
    if (!viewer) {
      return { hasAccess: false, skill, skillVersion };
    }

    if (skill.authorUserId === viewer._id) {
      return { hasAccess: true, skill, skillVersion };
    }

    const rfs = await ctx.db.get(skill.rfsId);
    if (rfs?.authorUserId === viewer._id) {
      return { hasAccess: true, skill, skillVersion };
    }

    if (rfs) {
      const contributions = await ctx.db
        .query("contributions")
        .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
        .collect();
      const viewerIsBacker = contributions.some(
        (contribution) =>
          contribution.status === "accepted" && contribution.backerUserId === viewer._id,
      );
      if (viewerIsBacker && (rfs.status === "evaluation_open" || rfs.status === "disputed" || rfs.status === "published")) {
        return { hasAccess: true, skill, skillVersion };
      }
    }

    const grant = await ctx.db
      .query("accessGrants")
      .withIndex("by_user_skill", (q) => q.eq("userId", viewer._id).eq("skillId", skill._id))
      .first();

    return {
      hasAccess: Boolean(grant),
      skill,
      skillVersion,
    };
  },
});
