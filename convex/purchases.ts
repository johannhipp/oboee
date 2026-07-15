import { ConvexError, v } from "convex/values";

import { query, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";
import {
  assertPaymentEventCompatible,
  paymentIdempotencyConflict,
  type PaymentPrincipal,
} from "./lib/paymentBoundary";
import { recordEarning } from "./lib/earnings";
import { purchaseEarningSourceKey } from "./lib/rfsDomain";
import { skillMetadataValidator, toSkillMetadata } from "./lib/skillMetadata";

export type PurchasePaymentArgs = {
  skillId: string;
  amountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
};

const principalMatches = (
  row: { buyerUserId?: string; anonymousPaymentReference?: string },
  principal: PaymentPrincipal,
) =>
  principal.kind === "user"
    ? row.buyerUserId === principal.userId &&
      row.anonymousPaymentReference === undefined
    : row.buyerUserId === undefined &&
      row.anonymousPaymentReference === principal.paymentReference;

export const applyPurchasePayment = async (
  ctx: MutationCtx,
  args: PurchasePaymentArgs,
  principal: PaymentPrincipal,
) => {
  const currencyAddress = args.currencyAddress.trim().toLowerCase();
  const skillId = ctx.db.normalizeId("skills", args.skillId);
  if (!skillId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
  }

  const expectedPaymentEvent = {
    type: "buy" as const,
    resourceId: skillId,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress,
    status: "accepted",
  };
  const existingPaymentEvent = await ctx.db
    .query("paymentEvents")
    .withIndex("by_challengeId", (query) =>
      query.eq("challengeId", args.challengeId),
    )
    .unique();
  assertPaymentEventCompatible(existingPaymentEvent, expectedPaymentEvent);

  const existingChallenge = await ctx.db
    .query("purchases")
    .withIndex("by_challengeId", (query) =>
      query.eq("challengeId", args.challengeId),
    )
    .unique();
  if (existingChallenge) {
    const isExactRetry =
      existingChallenge.skillId === skillId &&
      existingChallenge.amountBaseUnits === args.amountBaseUnits &&
      existingChallenge.currencyAddress === currencyAddress &&
      existingChallenge.receiptReference === args.receiptReference &&
      principalMatches(existingChallenge, principal);
    if (!isExactRetry) {
      paymentIdempotencyConflict();
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
      contentMarkdown: existingSkill.contentMarkdown,
    };
  }

  if (existingPaymentEvent) {
    paymentIdempotencyConflict();
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
    ...(principal.kind === "user"
      ? { buyerUserId: principal.userId }
      : { anonymousPaymentReference: principal.paymentReference }),
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
  });

  if (principal.kind === "user") {
    const existingGrant = await ctx.db
      .query("accessGrants")
      .withIndex("by_user_skill", (query) =>
        query.eq("userId", principal.userId).eq("skillId", skill._id),
      )
      .unique();
    if (!existingGrant) {
      await ctx.db.insert("accessGrants", {
        userId: principal.userId,
        skillId: skill._id,
        source: "purchase",
      });
    }
  }

  await recordEarning(ctx, {
    sourceKey: purchaseEarningSourceKey(purchaseId),
    rfsId: skill.rfsId,
    researcherUserId: skill.authorUserId,
    sourceKind: "purchase",
    purchaseId,
    grossAmountBaseUnits: args.amountBaseUnits,
    currencyAddress,
  });
  await ctx.db.insert("paymentEvents", expectedPaymentEvent);

  return {
    purchaseId,
    accessGranted: true,
    contentMarkdown: skill.contentMarkdown,
  };
};

export const checkAccess = query({
  args: { skillId: v.string() },
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
      .withIndex("by_user_skill", (query) =>
        query.eq("userId", viewer._id).eq("skillId", skill._id),
      )
      .unique();
    return { hasAccess: Boolean(grant), skill: toSkillMetadata(skill) };
  },
});

export const readEntitledContent = query({
  args: { skillId: v.string() },
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
        .withIndex("by_user_skill", (query) =>
          query.eq("userId", viewer._id).eq("skillId", skill._id),
        )
        .unique();
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
