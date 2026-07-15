import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

const walletAddressValidator = /^0x[a-fA-F0-9]{40}$/;

const rfsStatusValidator = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("fulfilled"),
  v.literal("published"),
  v.literal("cancelled"),
);

const rfsDocValidator = v.object({
  _id: v.id("rfs"),
  _creationTime: v.number(),
  authorUserId: v.string(),
  claimantUserId: v.optional(v.string()),
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  tags: v.array(v.string()),
  fundingThresholdBaseUnits: v.int64(),
  minimumContributionBaseUnits: v.int64(),
  currentAmountBaseUnits: v.int64(),
  fundingTokenAddress: v.string(),
  status: rfsStatusValidator,
});

const cleanTags = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

const requireAuthedUserId = async (ctx: MutationCtx | QueryCtx) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return user._id;
};

const computeFeeSplit = (grossAmountBaseUnits: bigint) => {
  const platformFeeBaseUnits = grossAmountBaseUnits / BigInt(100);
  const netAmountBaseUnits = grossAmountBaseUnits - platformFeeBaseUnits;
  return { platformFeeBaseUnits, netAmountBaseUnits };
};

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
    const tags = cleanTags(args.tags);
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
    if (args.minimumContributionBaseUnits > args.fundingThresholdBaseUnits) {
      throw new ConvexError({
        code: "INVALID_MINIMUM_CONTRIBUTION",
        message: "Minimum contribution cannot exceed funding threshold.",
      });
    }
    if (!walletAddressValidator.test(fundingTokenAddress)) {
      throw new ConvexError({
        code: "INVALID_TOKEN_ADDRESS",
        message: "Funding token address must be a valid 0x-prefixed 40-hex string.",
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

export const get = query({
  args: {
    rfsId: v.id("rfs"),
  },
  returns: v.object({
    rfs: rfsDocValidator,
    canFund: v.boolean(),
    canClaim: v.boolean(),
    hasClaimant: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const rfs = await ctx.db.get(args.rfsId);

    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }

    const hasClaimant = Boolean(rfs.claimantUserId);
    const canFund = rfs.status === "open";
    const canClaim = rfs.status === "funded" && !hasClaimant;

    return { rfs, canFund, canClaim, hasClaimant };
  },
});

export const list = query({
  args: {
    status: v.optional(rfsStatusValidator),
    authorId: v.optional(v.string()),
  },
  returns: v.array(rfsDocValidator),
  handler: async (ctx, args) => {
    if (args.authorId) {
      const docs = await ctx.db
        .query("rfs")
        .withIndex("by_author", (q) => q.eq("authorUserId", args.authorId!))
        .order("desc")
        .collect();
      if (!args.status) {
        return docs;
      }
      return docs.filter((doc) => doc.status === args.status);
    }

    if (args.status) {
      return await ctx.db
        .query("rfs")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    }

    return await ctx.db.query("rfs").order("desc").collect();
  },
});

export const listContributions = query({
  args: {
    rfsId: v.id("rfs"),
  },
  returns: v.array(
    v.object({
      id: v.id("contributions"),
      backerUserId: v.string(),
      amountBaseUnits: v.int64(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contributions")
      .withIndex("by_rfs", (q) => q.eq("rfsId", args.rfsId))
      .order("desc")
      .collect();

    return rows
      .filter((row) => row.status === "accepted")
      .map((row) => ({
        id: row._id,
        backerUserId: row.backerUserId,
        amountBaseUnits: row.amountBaseUnits,
        createdAt: row._creationTime,
      }));
  },
});

export const claim = mutation({
  args: {
    rfsId: v.id("rfs"),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    claimantUserId: v.string(),
    nextState: rfsStatusValidator,
  }),
  handler: async (ctx, args) => {
    const callerUserId = await requireAuthedUserId(ctx);
    const rfs = await getRfsByIdOrThrow(ctx, args.rfsId);

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
    rfsId: v.id("rfs"),
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
    const tags = cleanTags(args.tags);

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

    const rfs = await getRfsByIdOrThrow(ctx, args.rfsId);

    if (rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the claimant can submit this RFS.",
      });
    }

    if (rfs.status !== "funded" && rfs.status !== "fulfilled" && rfs.status !== "published") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS must be funded before submission.",
      });
    }

    const existingSkill = await ctx.db
      .query("skills")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();

    let skillId = existingSkill?._id;

    if (existingSkill) {
      await ctx.db.patch(existingSkill._id, {
        authorUserId: callerUserId,
        contentMarkdown,
        summary,
        tags,
        purchasePriceBaseUnits: args.purchasePriceBaseUnits,
        status: "published",
      });
    } else {
      skillId = await ctx.db.insert("skills", {
        rfsId: rfs._id,
        authorUserId: callerUserId,
        contentMarkdown,
        summary,
        tags,
        purchasePriceBaseUnits: args.purchasePriceBaseUnits,
        status: "published",
      });
    }

    if (rfs.status === "funded") {
      await ctx.db.patch(rfs._id, { status: "fulfilled" });
    }
    if (rfs.status !== "published") {
      await ctx.db.patch(rfs._id, { status: "published" });
    }

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
      if (contribution.amountBaseUnits >= rfs.minimumContributionBaseUnits) {
        qualifyingBackers.add(contribution.backerUserId);
      }
    }

    for (const userId of qualifyingBackers) {
      const existingGrant = await ctx.db
        .query("accessGrants")
        .withIndex("by_user_skill", (q) => q.eq("userId", userId).eq("skillId", skillId!))
        .first();
      if (!existingGrant) {
        await ctx.db.insert("accessGrants", {
          userId,
          skillId: skillId!,
          source: "backer_unlock",
        });
      }
    }

    const existingPayoutLedger = await ctx.db
      .query("payoutLedger")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();

    if (!existingPayoutLedger) {
      const { platformFeeBaseUnits, netAmountBaseUnits } =
        computeFeeSplit(grossAmountBaseUnits);

      await ctx.db.insert("payoutLedger", {
        rfsId: rfs._id,
        researcherUserId: callerUserId,
        grossAmountBaseUnits,
        platformFeeBaseUnits,
        netAmountBaseUnits,
        status: "claimable",
      });
    }

    return {
      rfsId: rfs._id,
      skillId: skillId!,
      nextState: "published" as const,
    };
  },
});
