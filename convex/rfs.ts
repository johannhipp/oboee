import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import {
  rfsStatusValidator,
  skillStatusValidator,
  payoutAssessmentStatusValidator,
} from "./lib/validators";
import {
  cleanTags,
  computeFeeSplit,
  getLatestAssessment,
  getLatestSkillVersion,
  requireAuthedUserId,
  stableContentHash,
  userBackedRfs,
  walletAddressValidator,
} from "./lib/helpers";
import { retirePolicyV1 } from "./lib/legacy";

const EVALUATION_WINDOW_MS = 24 * 60 * 60 * 1000;
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

const skillVersionValidator = v.object({
  _id: v.id("skillVersions"),
  _creationTime: v.number(),
  skillId: v.id("skills"),
  rfsId: v.id("rfs"),
  version: v.number(),
  contentHash: v.string(),
  contentMarkdown: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  authorUserId: v.string(),
  status: skillStatusValidator,
  submittedAt: v.number(),
  evaluationDeadline: v.number(),
  acceptedAt: v.optional(v.number()),
  publishedAt: v.optional(v.number()),
  revisionOfVersion: v.optional(v.number()),
});

const payoutAssessmentValidator = v.object({
  _id: v.id("payoutAssessments"),
  _creationTime: v.number(),
  rfsId: v.id("rfs"),
  skillId: v.id("skills"),
  skillVersionId: v.id("skillVersions"),
  skillVersion: v.number(),
  authorUserId: v.string(),
  grossAmountBaseUnits: v.int64(),
  basePayoutBaseUnits: v.int64(),
  qualityMultiplierBps: v.number(),
  finalPayoutBaseUnits: v.int64(),
  platformFeeBaseUnits: v.int64(),
  unreleasedAmountBaseUnits: v.int64(),
  status: payoutAssessmentStatusValidator,
  assessmentReason: v.string(),
  evaluationWindowOpenedAt: v.number(),
  evaluationWindowClosedAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),
});

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
const sumAcceptedContributions = async (ctx: MutationCtx, rfs: Doc<"rfs">) => {
  const acceptedContributions = await ctx.db
    .query("contributions")
    .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
    .collect();

  let grossAmountBaseUnits = BigInt(0);
  for (const contribution of acceptedContributions) {
    if (contribution.status === "accepted") {
      grossAmountBaseUnits += contribution.amountBaseUnits;
    }
  }
  return grossAmountBaseUnits;
};
/** @deprecated Policy v1 is retired. Use POST /api/v2/rfs. */
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
    retirePolicyV1("POST /api/v2/rfs");
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
      throw new ConvexError({ code: "INVALID_DESCRIPTION", message: "Description is required." });
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
      policyVersion: 1,
    });

    return { rfsId, nextState: "open" as const };
  },
});

/** @deprecated Policy v1 is retired. Use GET /api/v2/rfs/{rfsId}. */
export const get = query({
  args: {
    rfsId: v.id("rfs"),
  },
  returns: v.object({
    rfs: rfsDocValidator,
    latestSkillVersion: v.optional(skillVersionValidator),
    payoutAssessment: v.optional(payoutAssessmentValidator),
    evaluationCount: v.number(),
    canFund: v.boolean(),
    canClaim: v.boolean(),
    canEvaluate: v.boolean(),
    canRevise: v.boolean(),
    canClaimPayout: v.boolean(),
    hasClaimant: v.boolean(),
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/rfs/{rfsId}");
    const rfs = await ctx.db.get(args.rfsId);

    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();
    const latestSkillVersion = skill ? await getLatestSkillVersion(ctx, skill._id) : undefined;
    const payoutAssessment = await getLatestAssessment(ctx, rfs._id);
    const evaluations = await ctx.db
      .query("evaluationEvents")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .collect();

    const viewer = await authComponent.safeGetAuthUser(ctx);
    const viewerId = viewer?._id;
    const hasClaimant = Boolean(rfs.claimantUserId);
    const canFund = rfs.status === "open";
    const canClaim = rfs.status === "funded" && !hasClaimant;
    const viewerIsBacker = viewerId ? await userBackedRfs(ctx, rfs._id, viewerId) : false;
    const viewerCanAccessEvaluation = Boolean(
      viewerId &&
        latestSkillVersion &&
        (rfs.authorUserId === viewerId || viewerIsBacker || rfs.claimantUserId === viewerId),
    );
    const canEvaluate = Boolean(
      viewerCanAccessEvaluation &&
        rfs.claimantUserId !== viewerId &&
        (rfs.status === "evaluation_open" || rfs.status === "disputed"),
    );
    const canRevise = Boolean(viewerId && rfs.claimantUserId === viewerId && rfs.status === "revision_requested");
    const canClaimPayout = Boolean(
      viewerId &&
        rfs.claimantUserId === viewerId &&
        rfs.status === "published" &&
        payoutAssessment &&
        (payoutAssessment.status === "claimable" ||
          payoutAssessment.status === "reduced" ||
          payoutAssessment.status === "manually_resolved") &&
        payoutAssessment.finalPayoutBaseUnits > BigInt(0),
    );

    return {
      rfs,
      latestSkillVersion,
      payoutAssessment,
      evaluationCount: evaluations.length,
      canFund,
      canClaim,
      canEvaluate,
      canRevise,
      canClaimPayout,
      hasClaimant,
    };
  },
});

/** @deprecated Policy v1 is retired. Use GET /api/v2/catalog. */
export const list = query({
  args: {
    status: v.optional(rfsStatusValidator),
    authorId: v.optional(v.string()),
  },
  returns: v.array(rfsDocValidator),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/catalog");
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

/** @deprecated Policy v1 is retired. Use GET /api/v2/rfs/{rfsId}/settlement. */
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
    retirePolicyV1("GET /api/v2/rfs/{rfsId}/settlement");
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

/** @deprecated First-come claiming is removed. Use POST /api/v2/rfs/{rfsId}/applications. */
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
    retirePolicyV1("POST /api/v2/rfs/{rfsId}/applications");
    const callerUserId = await requireAuthedUserId(ctx);
    const rfs = await getRfsByIdOrThrow(ctx, args.rfsId);

    if (rfs.policyVersion === 2) {
      throw new ConvexError({
        code: "API_VERSION_RETIRED",
        message: "Policy-v2 requests use scored applications; direct claim is unavailable.",
      });
    }

    if (rfs.status !== "funded") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS can only be assigned while funded.",
      });
    }

    if (rfs.claimantUserId && rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({
        code: "ALREADY_CLAIMED",
        message: "RFS has already been assigned.",
      });
    }

    await ctx.db.patch(rfs._id, {
      claimantUserId: callerUserId,
      status: "assigned",
    });

    return {
      rfsId: rfs._id,
      claimantUserId: callerUserId,
      nextState: "assigned" as const,
    };
  },
});

/** @deprecated Policy v1 is retired. Use POST /api/v2/rfs/{rfsId}/submissions. */
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
    skillVersionId: v.id("skillVersions"),
    version: v.number(),
    contentHash: v.string(),
    evaluationDeadline: v.number(),
    payoutAssessmentId: v.id("payoutAssessments"),
    nextState: rfsStatusValidator,
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("POST /api/v2/rfs/{rfsId}/submissions");
    const callerUserId = await requireAuthedUserId(ctx);
    const contentMarkdown = args.contentMarkdown.trim();
    const summary = args.summary.trim();
    const tags = cleanTags(args.tags);

    if (!contentMarkdown) {
      throw new ConvexError({ code: "INVALID_CONTENT", message: "Skill content is required." });
    }
    if (!summary) {
      throw new ConvexError({ code: "INVALID_SUMMARY", message: "Skill summary is required." });
    }
    if (args.purchasePriceBaseUnits < BigInt(1)) {
      throw new ConvexError({ code: "INVALID_PRICE", message: "Purchase price must be at least 1 base unit." });
    }

    const rfs = await getRfsByIdOrThrow(ctx, args.rfsId);

    if (rfs.policyVersion === 2) {
      throw new ConvexError({
        code: "API_VERSION_RETIRED",
        message: "Policy-v2 submissions use the versioned submission workflow.",
      });
    }

    if (rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Only the assigned claimant can submit this RFS." });
    }

    if (rfs.status !== "assigned" && rfs.status !== "revision_requested") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS must be assigned or awaiting revision before submission.",
      });
    }

    const existingSkill = await ctx.db
      .query("skills")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();

    const previousVersion = existingSkill ? await getLatestSkillVersion(ctx, existingSkill._id) : undefined;
    const version = (previousVersion?.version ?? 0) + 1;
    if (version > 2) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only one revision window is supported in the MVP.",
      });
    }

    const contentHash = stableContentHash([
      rfs._id,
      version.toString(),
      contentMarkdown,
      summary,
      tags.join(","),
      args.purchasePriceBaseUnits.toString(),
    ]);

    const now = Date.now();
    const evaluationDeadline = now + EVALUATION_WINDOW_MS;
    const grossAmountBaseUnits = await sumAcceptedContributions(ctx, rfs);
    const { platformFeeBaseUnits, netAmountBaseUnits } = computeFeeSplit(grossAmountBaseUnits);

    const skillId = existingSkill
      ? existingSkill._id
      : await ctx.db.insert("skills", {
          rfsId: rfs._id,
          authorUserId: callerUserId,
          contentMarkdown,
          summary,
          tags,
          purchasePriceBaseUnits: args.purchasePriceBaseUnits,
          latestVersion: version,
          latestContentHash: contentHash,
          status: "evaluation_open",
        });

    if (existingSkill) {
      await ctx.db.patch(existingSkill._id, {
        authorUserId: callerUserId,
        contentMarkdown,
        summary,
        tags,
        purchasePriceBaseUnits: args.purchasePriceBaseUnits,
        latestVersion: version,
        latestContentHash: contentHash,
        status: "evaluation_open",
      });
    }

    const skillVersionId = await ctx.db.insert("skillVersions", {
      skillId,
      rfsId: rfs._id,
      version,
      contentHash,
      contentMarkdown,
      summary,
      tags,
      purchasePriceBaseUnits: args.purchasePriceBaseUnits,
      authorUserId: callerUserId,
      status: "evaluation_open",
      submittedAt: now,
      evaluationDeadline,
      acceptedAt: undefined,
      publishedAt: undefined,
      revisionOfVersion: previousVersion?.version,
    });

    const existingLedger = await ctx.db
      .query("payoutLedger")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();

    if (existingLedger) {
      await ctx.db.patch(existingLedger._id, {
        researcherUserId: callerUserId,
        grossAmountBaseUnits,
        platformFeeBaseUnits,
        netAmountBaseUnits,
        status: "locked",
        receiptReference: undefined,
      });
    } else {
      await ctx.db.insert("payoutLedger", {
        rfsId: rfs._id,
        researcherUserId: callerUserId,
        grossAmountBaseUnits,
        platformFeeBaseUnits,
        netAmountBaseUnits,
        status: "locked",
        receiptReference: undefined,
      });
    }

    const payoutAssessmentId = await ctx.db.insert("payoutAssessments", {
      rfsId: rfs._id,
      skillId,
      skillVersionId,
      skillVersion: version,
      authorUserId: callerUserId,
      grossAmountBaseUnits,
      basePayoutBaseUnits: netAmountBaseUnits,
      qualityMultiplierBps: 0,
      finalPayoutBaseUnits: BigInt(0),
      platformFeeBaseUnits,
      unreleasedAmountBaseUnits: netAmountBaseUnits,
      status: "pending",
      assessmentReason:
        "Evaluation opened. One negative review can dispute or hold payout, but reduction or blocking requires independent evidence-backed corroboration.",
      evaluationWindowOpenedAt: now,
      evaluationWindowClosedAt: undefined,
      resolvedAt: undefined,
    });

    await ctx.db.patch(rfs._id, { status: "evaluation_open" });

    return {
      rfsId: rfs._id,
      skillId,
      skillVersionId,
      version,
      contentHash,
      evaluationDeadline,
      payoutAssessmentId,
      nextState: "evaluation_open" as const,
    };
  },
});
