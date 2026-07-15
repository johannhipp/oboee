import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { MAX_MVP_PAYMENT_BASE_UNITS } from "../shared/domain/money";
import { normalizeTags } from "../shared/domain/strings";
import { TEMPO_MODERATO_PATH_USD } from "../shared/domain/tempo";
import { requireAuthedUserId } from "./lib/auth";
import { recordEarning } from "./lib/earnings";
import {
  canClaimRfs,
  canFundRfs,
  canSubmitRfs,
  fundingEarningSourceKey,
} from "./lib/rfsDomain";
import { rfsDocValidator, rfsStatusValidator } from "./lib/validators";

const getRfsByIdOrThrow = async (ctx: MutationCtx | QueryCtx, rfsId: Doc<"rfs">["_id"]) => {
  const rfs = await ctx.db.get(rfsId);
  if (!rfs) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "RFS not found.",
    });
  }
  return rfs;
};

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    scope: v.string(),
    tags: v.array(v.string()),
    fundingThresholdBaseUnits: v.int64(),
    minimumContributionBaseUnits: v.int64(),
    fundingTokenAddress: v.string(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    nextState: rfsStatusValidator,
  }),
  handler: async (ctx, args) => {
    const authorUserId = await requireAuthedUserId(ctx);
    const title = args.title.trim();
    const description = args.description.trim();
    const scope = args.scope.trim();
    const tags = normalizeTags(args.tags);
    const fundingTokenAddress = args.fundingTokenAddress.trim().toLowerCase();

    if (!title) {
      throw new ConvexError({ code: "INVALID_TITLE", message: "Title is required." });
    }
    if (!description) {
      throw new ConvexError({
        code: "INVALID_DESCRIPTION",
        message: "Description is required.",
      });
    }
    if (!scope) {
      throw new ConvexError({ code: "INVALID_SCOPE", message: "Scope is required." });
    }
    if (args.fundingThresholdBaseUnits < BigInt(1)) {
      throw new ConvexError({
        code: "INVALID_THRESHOLD",
        message: "Funding threshold must be at least 1 base unit.",
      });
    }
    if (args.minimumContributionBaseUnits < BigInt(1)) {
      throw new ConvexError({
        code: "INVALID_MINIMUM_CONTRIBUTION",
        message: "Minimum contribution must be at least 1 base unit.",
      });
    }
    if (args.minimumContributionBaseUnits > MAX_MVP_PAYMENT_BASE_UNITS) {
      throw new ConvexError({
        code: "INVALID_MINIMUM_CONTRIBUTION",
        message: "Minimum contribution must not exceed 9000 testnet base units.",
      });
    }
    if (args.minimumContributionBaseUnits > args.fundingThresholdBaseUnits) {
      throw new ConvexError({
        code: "INVALID_MINIMUM_CONTRIBUTION",
        message: "Minimum contribution cannot exceed funding threshold.",
      });
    }
    if (fundingTokenAddress !== TEMPO_MODERATO_PATH_USD) {
      throw new ConvexError({
        code: "INVALID_TOKEN_ADDRESS",
        message: "Funding token must be Tempo Moderato pathUSD.",
      });
    }

    const rfsId = await ctx.db.insert("rfs", {
      authorUserId,
      claimantUserId: undefined,
      title,
      description,
      scope,
      tags,
      fundingThresholdBaseUnits: args.fundingThresholdBaseUnits,
      minimumContributionBaseUnits: args.minimumContributionBaseUnits,
      currentAmountBaseUnits: BigInt(0),
      fundingTokenAddress,
      status: "open",
    });

    return { rfsId, nextState: "open" as const };
  },
});

export const getPublic = query({
  args: {
    rfsId: v.string(),
  },
  returns: v.object({
    rfs: rfsDocValidator,
    canFund: v.boolean(),
    canClaim: v.boolean(),
    hasClaimant: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
    const rfs = rfsId ? await ctx.db.get(rfsId) : null;

    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }

    const hasClaimant = Boolean(rfs.claimantUserId);
    const canFund = canFundRfs(rfs.status);
    const canClaim = canClaimRfs(rfs);

    return { rfs, canFund, canClaim, hasClaimant };
  },
});

export const listContributions = query({
  args: {
    rfsId: v.string(),
  },
  returns: v.array(
    v.object({
      id: v.id("contributions"),
      contributor: v.union(
        v.object({ kind: v.literal("user"), userId: v.string() }),
        v.object({
          kind: v.literal("anonymous"),
          paymentReference: v.string(),
        }),
      ),
      amountBaseUnits: v.int64(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
    if (!rfsId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    const rows = await ctx.db
      .query("contributions")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfsId))
      .order("desc")
      .take(50);

    return rows
      .filter((row) => row.status === "accepted")
      .map((row) => ({
        id: row._id,
        contributor: row.backerUserId
          ? { kind: "user" as const, userId: row.backerUserId }
          : {
              kind: "anonymous" as const,
              paymentReference:
                row.anonymousPaymentReference ?? row.challengeId,
            },
        amountBaseUnits: row.amountBaseUnits,
        createdAt: row._creationTime,
      }));
  },
});

export const claim = mutation({
  args: {
    rfsId: v.string(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    claimantUserId: v.string(),
    nextState: rfsStatusValidator,
  }),
  handler: async (ctx, args) => {
    const callerUserId = await requireAuthedUserId(ctx);
    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
    if (!rfsId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    const rfs = await getRfsByIdOrThrow(ctx, rfsId);

    if (rfs.status !== "funded") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS can only be claimed while funded.",
      });
    }

    if (rfs.claimantUserId && rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({
        code: "ALREADY_CLAIMED",
        message: "RFS has already been claimed.",
      });
    }

    if (!rfs.claimantUserId) {
      await ctx.db.patch(rfs._id, { claimantUserId: callerUserId });
    }

    return {
      rfsId: rfs._id,
      claimantUserId: callerUserId,
      nextState: rfs.status,
    };
  },
});

export const submit = mutation({
  args: {
    rfsId: v.string(),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    purchasePriceBaseUnits: v.int64(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    skillId: v.id("skills"),
    nextState: rfsStatusValidator,
  }),
  handler: async (ctx, args) => {
    const callerUserId = await requireAuthedUserId(ctx);
    const contentMarkdown = args.contentMarkdown.trim();
    const summary = args.summary.trim();
    const tags = normalizeTags(args.tags);

    if (!contentMarkdown) {
      throw new ConvexError({
        code: "INVALID_CONTENT",
        message: "Skill content is required.",
      });
    }
    if (!summary) {
      throw new ConvexError({
        code: "INVALID_SUMMARY",
        message: "Skill summary is required.",
      });
    }
    if (args.purchasePriceBaseUnits < BigInt(1)) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Purchase price must be at least 1 base unit.",
      });
    }
    if (args.purchasePriceBaseUnits > MAX_MVP_PAYMENT_BASE_UNITS) {
      throw new ConvexError({
        code: "INVALID_PRICE",
        message: "Purchase price must not exceed 9000 testnet base units.",
      });
    }

    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
    if (!rfsId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    const rfs = await getRfsByIdOrThrow(ctx, rfsId);

    if (rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the claimant can submit this RFS.",
      });
    }

    if (!canSubmitRfs(rfs, callerUserId)) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS is not available for submission.",
      });
    }

    const existingSkill = await ctx.db
      .query("skills")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();

    const skillId = existingSkill
      ? existingSkill._id
      : await ctx.db.insert("skills", {
          rfsId: rfs._id,
          authorUserId: callerUserId,
          contentMarkdown,
          summary,
          tags,
          purchasePriceBaseUnits: args.purchasePriceBaseUnits,
          status: "published",
        });

    if (existingSkill) {
      await ctx.db.patch(existingSkill._id, {
        authorUserId: callerUserId,
        contentMarkdown,
        summary,
        tags,
        purchasePriceBaseUnits: args.purchasePriceBaseUnits,
        status: "published",
      });
    }

    await ctx.db.patch(rfs._id, { status: "published" });

    const acceptedContributions = await ctx.db
      .query("contributions")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .collect();

    const qualifyingBackers = new Set<string>();
    let grossAmountBaseUnits = BigInt(0);

    for (const contribution of acceptedContributions) {
      if (contribution.status !== "accepted") {
        continue;
      }
      grossAmountBaseUnits += contribution.amountBaseUnits;
      if (
        contribution.backerUserId &&
        contribution.amountBaseUnits >= rfs.minimumContributionBaseUnits
      ) {
        qualifyingBackers.add(contribution.backerUserId);
      }
    }

    for (const userId of qualifyingBackers) {
      const existingGrant = await ctx.db
        .query("accessGrants")
        .withIndex("by_user_skill", (q) => q.eq("userId", userId).eq("skillId", skillId))
        .first();
      if (!existingGrant) {
        await ctx.db.insert("accessGrants", {
          userId,
          skillId,
          source: "backer_unlock",
        });
      }
    }

    await recordEarning(ctx, {
      sourceKey: fundingEarningSourceKey(rfs._id),
      rfsId: rfs._id,
      researcherUserId: callerUserId,
      sourceKind: "funding",
      grossAmountBaseUnits,
      currencyAddress: rfs.fundingTokenAddress,
    });

    return {
      rfsId: rfs._id,
      skillId,
      nextState: "published" as const,
    };
  },
});
