import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { computeFeeSplit, getLatestSkillVersion, userBackedRfs } from "./lib/helpers";
import { requirePrincipal } from "./lib/principals";
import { skillStatusValidator } from "./lib/validators";

const skillMetadataValidator = v.object({
  _id: v.id("skills"),
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  status: skillStatusValidator,
  quarantineState: v.optional(
    v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
  ),
});

export type ConfirmedPurchase = {
  paymentIntentId: Id<"paymentIntents">;
  skillId: Id<"skills">;
  skillVersionId: Id<"skillVersions">;
  buyerPrincipalId: string;
  buyerWalletId: Id<"principalWallets">;
  amountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
};

export const recordConfirmedPurchase = async (ctx: MutationCtx, args: ConfirmedPurchase) => {
  const skill = await ctx.db.get(args.skillId);
  const version = await ctx.db.get(args.skillVersionId);
  if (!skill || !version || version.skillId !== skill._id || skill.status !== "published") {
    throw new ConvexError({ code: "INVALID_STATE", message: "Published skill version not found." });
  }
  const existing = await ctx.db
    .query("purchases")
    .withIndex("by_challengeId", (query) => query.eq("challengeId", args.challengeId))
    .first();
  if (existing) {
    return { purchaseId: existing._id, accessGranted: existing.status !== "refunded" };
  }
  const purchaseId = await ctx.db.insert("purchases", {
    skillId: skill._id,
    skillVersionId: version._id,
    buyerUserId: args.buyerPrincipalId,
    buyerWalletId: args.buyerWalletId,
    paymentIntentId: args.paymentIntentId,
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress: args.currencyAddress,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    status: "confirmed",
  });
  const existingGrant = await ctx.db
    .query("accessGrants")
    .withIndex("by_user_skill", (query) =>
      query.eq("userId", args.buyerPrincipalId).eq("skillId", skill._id),
    )
    .first();
  if (!existingGrant) {
    await ctx.db.insert("accessGrants", {
      userId: args.buyerPrincipalId,
      principalId: args.buyerPrincipalId,
      skillId: skill._id,
      skillVersionId: version._id,
      source: "purchase",
      active: true,
    });
  }
  const { platformFeeBaseUnits, netAmountBaseUnits } = computeFeeSplit(args.amountBaseUnits);
  await ctx.db.insert("purchasePayoutBatches", {
    skillId: skill._id,
    authorPrincipalId: skill.authorUserId,
    fromPurchaseCreationTime: Date.now(),
    throughPurchaseCreationTime: Date.now(),
    grossBaseUnits: args.amountBaseUnits,
    platformFeeBaseUnits,
    netBaseUnits: netAmountBaseUnits,
    state: "open",
    createdAt: Date.now(),
  });
  await ctx.db.insert("paymentEvents", {
    type: "buy",
    resourceId: skill._id,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress: args.currencyAddress,
    status: "accepted",
  });
  return { purchaseId, accessGranted: true };
};

export const recordPurchase = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    buyerPrincipalId: v.string(),
    buyerWalletId: v.id("principalWallets"),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
  },
  returns: v.object({ purchaseId: v.id("purchases"), accessGranted: v.boolean() }),
  handler: recordConfirmedPurchase,
});

const principalHasSkillAccess = async (
  ctx: QueryCtx,
  args: { principalId: string; skillId: Id<"skills">; skillVersionId: Id<"skillVersions"> },
) => {
  const skill = await ctx.db.get(args.skillId);
  if (!skill) {
    return false;
  }
  if (skill.authorUserId === args.principalId) {
    return true;
  }
  const rfs = await ctx.db.get(skill.rfsId);
  if (rfs?.authorUserId === args.principalId) {
    return true;
  }
  if (rfs && (await userBackedRfs(ctx, rfs._id, args.principalId))) {
    return rfs.status === "evaluation_open" || rfs.status === "disputed" || rfs.status === "published";
  }
  const grant = await ctx.db
    .query("accessGrants")
    .withIndex("by_user_skill", (query) =>
      query.eq("userId", args.principalId).eq("skillId", skill._id),
    )
    .first();
  if (grant && grant.active !== false && (!grant.skillVersionId || grant.skillVersionId === args.skillVersionId)) {
    return true;
  }
  const assignments = await ctx.db
    .query("reviewAssignments")
    .withIndex("by_reviewer_and_state", (query) =>
      query.eq("reviewerPrincipalId", args.principalId).eq("state", "accepted"),
    )
    .collect();
  return assignments.some((assignment) => assignment.rfsId === skill.rfsId);
};

export const checkAccess = query({
  args: { skillId: v.id("skills") },
  returns: v.object({
    hasAccess: v.boolean(),
    skill: v.union(skillMetadataValidator, v.null()),
    skillVersion: v.union(
      v.object({
        skillVersionId: v.id("skillVersions"),
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
    const latest = await getLatestSkillVersion(ctx, skill._id);
    const principal = await requirePrincipal(ctx).catch(() => null);
    const hasAccess = Boolean(
      principal &&
        latest &&
        (await principalHasSkillAccess(ctx, {
          principalId: principal.principalId,
          skillId: skill._id,
          skillVersionId: latest._id,
        })),
    );
    return {
      hasAccess,
      skill: {
        _id: skill._id,
        rfsId: skill.rfsId,
        authorUserId: skill.authorUserId,
        summary: skill.summary,
        tags: skill.tags,
        purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
        status: skill.status,
        quarantineState: skill.quarantineState,
      },
      skillVersion: latest
        ? {
            skillVersionId: latest._id,
            version: latest.version,
            contentHash: latest.contentHash,
            evaluationDeadline: latest.evaluationDeadline,
          }
        : null,
    };
  },
});

export const getAuthorizedContent = query({
  args: { skillId: v.id("skills"), skillVersionId: v.optional(v.id("skillVersions")) },
  returns: v.object({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    version: v.number(),
    contentHash: v.string(),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const skill = await ctx.db.get(args.skillId);
    if (!skill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    let version = args.skillVersionId
      ? await ctx.db.get(args.skillVersionId)
      : await getLatestSkillVersion(ctx, skill._id);
    if (!version || version.skillId !== skill._id) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill version not found." });
    }
    if (
      (version.quarantineState === "quarantined" || skill.quarantineState === "quarantined") &&
      skill.authorUserId !== principal.principalId
    ) {
      version = skill.safeFallbackVersionId ? await ctx.db.get(skill.safeFallbackVersionId) : null;
      if (!version || version.skillId !== skill._id || version.quarantineState === "quarantined") {
        throw new ConvexError({ code: "CONTENT_QUARANTINED", message: "No safe skill version is available." });
      }
    }
    if (!(await principalHasSkillAccess(ctx, {
      principalId: principal.principalId,
      skillId: skill._id,
      skillVersionId: version._id,
    }))) {
      throw new ConvexError({ code: "FORBIDDEN", message: "An active exact-version access grant is required." });
    }
    return {
      skillId: skill._id,
      skillVersionId: version._id,
      version: version.version,
      contentHash: version.contentHash,
      contentMarkdown: version.contentMarkdown,
      summary: version.summary,
      tags: version.tags,
    };
  },
});
