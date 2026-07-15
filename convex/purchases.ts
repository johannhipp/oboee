import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import {
  assertPaymentEventCompatible,
  assertPaymentServerSecret,
  paymentIdempotencyConflict,
  resolvePaymentPrincipal,
} from "./lib/paymentBoundary";
import { skillMetadataValidator, toSkillMetadata } from "./lib/skillMetadata";

const computeFeeSplit = (grossAmountBaseUnits: bigint) => {
  const platformFeeBaseUnits = grossAmountBaseUnits / BigInt(100);
  const netAmountBaseUnits = grossAmountBaseUnits - platformFeeBaseUnits;
  return { platformFeeBaseUnits, netAmountBaseUnits };
};

export const recordPurchase = mutation({
  args: {
    skillId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    principalUserId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  returns: v.object({
    purchaseId: v.id("purchases"),
    accessGranted: v.boolean(),
    buyerUserId: v.string(),
    contentMarkdown: v.string(),
  }),
  handler: async (ctx, args) => {
    assertPaymentServerSecret(args.serverSecret);
    const user = await authComponent.safeGetAuthUser(ctx);
    const buyerUserId = resolvePaymentPrincipal(
      user?._id,
      args.principalUserId,
      args.challengeId,
    );
    const currencyAddress = args.currencyAddress.trim().toLowerCase();
    const skillId = ctx.db.normalizeId("skills", args.skillId);

    const expectedPaymentEvent = {
      type: "buy" as const,
      resourceId: args.skillId,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      status: "accepted",
    };
    const existingPaymentEvent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    assertPaymentEventCompatible(existingPaymentEvent, expectedPaymentEvent);

    const existingChallenge = await ctx.db
      .query("purchases")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    if (existingChallenge) {
      const isExactRetry =
        skillId !== null &&
        existingChallenge.skillId === skillId &&
        existingChallenge.amountBaseUnits === args.amountBaseUnits &&
        existingChallenge.currencyAddress === currencyAddress &&
        existingChallenge.receiptReference === args.receiptReference &&
        existingChallenge.buyerUserId === buyerUserId;
      if (!isExactRetry) {
        throw new ConvexError({
          code: "IDEMPOTENCY_CONFLICT",
          message: "This payment challenge was already recorded with different facts.",
        });
      }
      const existingSkill = await ctx.db.get(existingChallenge.skillId);
      if (!existingSkill) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
      }
      if (!existingPaymentEvent) {
        await ctx.db.insert("paymentEvents", expectedPaymentEvent);
      }
      return {
        purchaseId: existingChallenge._id,
        accessGranted: true,
        buyerUserId: existingChallenge.buyerUserId,
        contentMarkdown: existingSkill.contentMarkdown,
      };
    }

    if (existingPaymentEvent) {
      paymentIdempotencyConflict();
    }

    if (!skillId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    const skill = await ctx.db.get(skillId);
    if (!skill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    if (skill.status !== "published") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Skill can only be purchased while published.",
      });
    }

    const rfs = await ctx.db.get(skill.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    if (currencyAddress !== rfs.fundingTokenAddress) {
      throw new ConvexError({
        code: "INVALID_CURRENCY",
        message: "Purchase currency does not match the skill funding token.",
      });
    }
    if (args.amountBaseUnits !== skill.purchasePriceBaseUnits) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Purchase amount must match the listed price.",
      });
    }

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
    });

    await ctx.db.insert("paymentEvents", expectedPaymentEvent);

    return {
      purchaseId,
      accessGranted: true,
      buyerUserId,
      contentMarkdown: skill.contentMarkdown,
    };
  },
});

export const checkAccess = query({
  args: {
    skillId: v.string(),
  },
  returns: v.object({
    hasAccess: v.boolean(),
    skill: v.union(skillMetadataValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    if (!skillId) {
      return { hasAccess: false, skill: null };
    }
    const skill = await ctx.db.get(skillId);
    if (!skill) {
      return { hasAccess: false, skill: null };
    }

    const viewer = await authComponent.safeGetAuthUser(ctx);
    if (!viewer) {
      return { hasAccess: false, skill: toSkillMetadata(skill) };
    }

    if (skill.authorUserId === viewer._id) {
      return { hasAccess: true, skill: toSkillMetadata(skill) };
    }

    const grant = await ctx.db
      .query("accessGrants")
      .withIndex("by_user_skill", (q) => q.eq("userId", viewer._id).eq("skillId", skill._id))
      .first();

    return {
      hasAccess: Boolean(grant),
      skill: toSkillMetadata(skill),
    };
  },
});

export const readEntitledContent = query({
  args: {
    skillId: v.string(),
  },
  returns: v.union(
    v.object({
      skillId: v.id("skills"),
      contentMarkdown: v.string(),
      status: v.literal("published"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    const skill = skillId ? await ctx.db.get(skillId) : null;
    if (!skill || skill.status !== "published") {
      return null;
    }

    const viewer = await authComponent.safeGetAuthUser(ctx);
    if (!viewer) {
      return null;
    }
    if (skill.authorUserId !== viewer._id) {
      const grant = await ctx.db
        .query("accessGrants")
        .withIndex("by_user_skill", (q) =>
          q.eq("userId", viewer._id).eq("skillId", skill._id),
        )
        .first();
      if (!grant) {
        return null;
      }
    }

    return {
      skillId: skill._id,
      contentMarkdown: skill.contentMarkdown,
      status: "published" as const,
    };
  },
});
