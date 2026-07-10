import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { payoutAssessmentStatusValidator, rfsStatusValidator } from "./lib/validators";
import {
  getLatestAssessmentOrThrow,
  getLatestSkillVersion,
  getSkillAndLatestVersion,
  requireAuthedUserId,
  userBackedRfs,
} from "./lib/helpers";
import { retirePolicyV1 } from "./lib/legacy";

const reviewerTypeValidator = v.union(
  v.literal("agent"),
  v.literal("human"),
  v.literal("platform_evaluator"),
);

const outcomeValidator = v.union(
  v.literal("resolved"),
  v.literal("improved"),
  v.literal("no_effect"),
  v.literal("harmful"),
  v.literal("unable_to_apply"),
);

const confidenceValidator = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

const evidenceTypeValidator = v.union(
  v.literal("test_result"),
  v.literal("scanner_result"),
  v.literal("exploit_reproduction"),
  v.literal("diff_attestation"),
  v.literal("human_review"),
  v.literal("freeform"),
);

const evidenceStrengthBps = (evidenceType: Doc<"evaluationEvents">["evidenceType"]) => {
  if (
    evidenceType === "test_result" ||
    evidenceType === "scanner_result" ||
    evidenceType === "exploit_reproduction" ||
    evidenceType === "diff_attestation"
  ) {
    return 10_000;
  }
  if (evidenceType === "human_review") {
    return 7_000;
  }
  return 2_000;
};

const confidenceBps = (confidence: Doc<"evaluationEvents">["confidence"]) => {
  if (confidence === "high") {
    return 10_000;
  }
  if (confidence === "medium") {
    return 7_000;
  }
  return 4_000;
};

const isPositiveOutcome = (outcome: Doc<"evaluationEvents">["outcome"], rating: number) =>
  (outcome === "resolved" || outcome === "improved") && rating >= 4;

const isNegativeOutcome = (outcome: Doc<"evaluationEvents">["outcome"], rating: number) =>
  outcome === "harmful" || outcome === "no_effect" || outcome === "unable_to_apply" || rating <= 2;

const assertCanViewEvaluation = async (ctx: QueryCtx | MutationCtx, rfs: Doc<"rfs">, userId: string) => {
  if (rfs.authorUserId === userId || rfs.claimantUserId === userId) {
    return;
  }
  if (await userBackedRfs(ctx, rfs._id, userId)) {
    return;
  }
  throw new ConvexError({
    code: "FORBIDDEN",
    message: "Only the RFS author, assigned author, or backers can view evaluation details.",
  });
};

const reviewerEligibleForPayoutImpact = async (
  ctx: QueryCtx | MutationCtx,
  rfs: Doc<"rfs">,
  userId: string,
) => {
  if (rfs.claimantUserId === userId) {
    return false;
  }
  if (rfs.authorUserId === userId) {
    return true;
  }
  return await userBackedRfs(ctx, rfs._id, userId);
};

const grantBackerAccess = async (ctx: MutationCtx, rfs: Doc<"rfs">, skillId: Id<"skills">) => {
  const contributions = await ctx.db
    .query("contributions")
    .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
    .collect();
  const qualifyingBackers = new Set<string>();

  for (const contribution of contributions) {
    if (
      contribution.status === "accepted" &&
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
};

const updateAuthorReputation = async (
  ctx: MutationCtx,
  args: {
    authorUserId: string;
    tags: string[];
    accepted: boolean;
    rejected: boolean;
    revised: boolean;
    disputed: boolean;
    outcomeScore: number;
  },
) => {
  const now = Date.now();
  for (const tag of args.tags) {
    const existing = await ctx.db
      .query("authorReputations")
      .withIndex("by_author_tag", (q) => q.eq("authorUserId", args.authorUserId).eq("tag", tag))
      .first();

    if (!existing) {
      await ctx.db.insert("authorReputations", {
        authorUserId: args.authorUserId,
        tag,
        qualityScore: args.outcomeScore,
        deliveryReliabilityScore: args.accepted ? 100 : 25,
        revisionRate: args.revised ? 1 : 0,
        disputeRate: args.disputed ? 1 : 0,
        acceptedSkillCount: args.accepted ? 1 : 0,
        rejectedSkillCount: args.rejected ? 1 : 0,
        weightedInstallCount: 0,
        weightedOutcomeScore: args.outcomeScore,
        confidence: "low",
        lastUpdatedAt: now,
      });
      continue;
    }

    const totalOutcomes = existing.acceptedSkillCount + existing.rejectedSkillCount + 1;
    const acceptedSkillCount = existing.acceptedSkillCount + (args.accepted ? 1 : 0);
    const rejectedSkillCount = existing.rejectedSkillCount + (args.rejected ? 1 : 0);
    const weightedOutcomeScore =
      (existing.weightedOutcomeScore * (totalOutcomes - 1) + args.outcomeScore) / totalOutcomes;
    const confidence =
      totalOutcomes >= 10 ? "high" : totalOutcomes >= 4 ? "medium" : "low";

    await ctx.db.patch(existing._id, {
      qualityScore: Math.round(weightedOutcomeScore),
      deliveryReliabilityScore: Math.round((acceptedSkillCount / totalOutcomes) * 100),
      revisionRate:
        (existing.revisionRate * (totalOutcomes - 1) + (args.revised ? 1 : 0)) / totalOutcomes,
      disputeRate:
        (existing.disputeRate * (totalOutcomes - 1) + (args.disputed ? 1 : 0)) / totalOutcomes,
      acceptedSkillCount,
      rejectedSkillCount,
      weightedOutcomeScore,
      confidence,
      lastUpdatedAt: now,
    });
  }
};

const finalizeAssessment = async (
  ctx: MutationCtx,
  args: {
    rfs: Doc<"rfs">;
    skill: Doc<"skills">;
    skillVersion: Doc<"skillVersions">;
    assessment: Doc<"payoutAssessments">;
    status: "claimable" | "reduced" | "blocked" | "disputed";
    rfsStatus: "published" | "revision_requested" | "rejected" | "disputed";
    multiplierBps: number;
    reason: string;
    final: boolean;
  },
) => {
  const now = Date.now();
  const finalPayoutBaseUnits =
    (args.assessment.basePayoutBaseUnits * BigInt(args.multiplierBps)) / BigInt(10_000);
  const unreleasedAmountBaseUnits = args.assessment.basePayoutBaseUnits - finalPayoutBaseUnits;

  await ctx.db.patch(args.assessment._id, {
    status: args.status,
    qualityMultiplierBps: args.multiplierBps,
    finalPayoutBaseUnits,
    unreleasedAmountBaseUnits,
    assessmentReason: args.reason,
    evaluationWindowClosedAt: now,
    resolvedAt: args.final ? now : undefined,
  });

  await ctx.db.patch(args.rfs._id, { status: args.rfsStatus });
  await ctx.db.patch(args.skill._id, { status: args.rfsStatus === "published" ? "published" : args.rfsStatus });
  await ctx.db.patch(args.skillVersion._id, {
    status: args.rfsStatus === "published" ? "published" : args.rfsStatus,
    acceptedAt: args.rfsStatus === "published" ? now : undefined,
    publishedAt: args.rfsStatus === "published" ? now : undefined,
  });

  const ledger = await ctx.db
    .query("payoutLedger")
    .withIndex("by_rfs", (q) => q.eq("rfsId", args.rfs._id))
    .first();

  if (ledger) {
    await ctx.db.patch(ledger._id, {
      status:
        args.status === "claimable"
          ? "claimable"
          : args.status === "reduced"
            ? "reduced"
            : args.status === "blocked"
              ? "blocked"
              : "locked",
      netAmountBaseUnits: finalPayoutBaseUnits,
    });
  }

  if (args.rfsStatus === "published") {
    await grantBackerAccess(ctx, args.rfs, args.skill._id);
  }

  if (args.final) {
    await updateAuthorReputation(ctx, {
      authorUserId: args.skill.authorUserId,
      tags: args.skill.tags,
      accepted: args.status === "claimable" || args.status === "reduced",
      rejected: args.status === "blocked",
      revised: args.skillVersion.version > 1,
      disputed: args.assessment.status === "disputed" || args.rfs.status === "disputed",
      outcomeScore: args.multiplierBps / 100,
    });
  }
};

/** @deprecated Policy v1 is retired. Use GET /api/v2/rfs/{rfsId}/evaluations. */
export const getForRfs = query({
  args: { rfsId: v.id("rfs") },
  returns: v.object({
    rfs: v.object({
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
    }),
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    version: v.number(),
    contentHash: v.string(),
    evaluationDeadline: v.number(),
    assessmentStatus: payoutAssessmentStatusValidator,
    assessmentReason: v.string(),
    qualityMultiplierBps: v.number(),
    finalPayoutBaseUnits: v.int64(),
    evaluationCount: v.number(),
    canEvaluate: v.boolean(),
    canCloseEvaluation: v.boolean(),
    canOpenDispute: v.boolean(),
    canRevise: v.boolean(),
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/rfs/{rfsId}/evaluations");
    const userId = await requireAuthedUserId(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    await assertCanViewEvaluation(ctx, rfs, userId);

    const { skill, latestVersion } = await getSkillAndLatestVersion(ctx, rfs._id);
    const assessment = await getLatestAssessmentOrThrow(ctx, rfs._id);
    const evaluations = await ctx.db
      .query("evaluationEvents")
      .withIndex("by_skillVersionId", (q) => q.eq("skillVersionId", latestVersion._id))
      .collect();
    const canEvaluate =
      rfs.claimantUserId !== userId &&
      (rfs.status === "evaluation_open" || rfs.status === "disputed") &&
      (await reviewerEligibleForPayoutImpact(ctx, rfs, userId));

    return {
      rfs,
      skillId: skill._id,
      skillVersionId: latestVersion._id,
      version: latestVersion.version,
      contentHash: latestVersion.contentHash,
      evaluationDeadline: latestVersion.evaluationDeadline,
      assessmentStatus: assessment.status,
      assessmentReason: assessment.assessmentReason,
      qualityMultiplierBps: assessment.qualityMultiplierBps,
      finalPayoutBaseUnits: assessment.finalPayoutBaseUnits,
      evaluationCount: evaluations.length,
      canEvaluate,
      canCloseEvaluation:
        userId === rfs.authorUserId || userId === rfs.claimantUserId || (await userBackedRfs(ctx, rfs._id, userId)),
      canOpenDispute: userId === rfs.authorUserId || userId === rfs.claimantUserId || (await userBackedRfs(ctx, rfs._id, userId)),
      canRevise: userId === rfs.claimantUserId && rfs.status === "revision_requested",
    };
  },
});

/** @deprecated Policy v1 is retired. Use POST /api/v2/rfs/{rfsId}/evaluations. */
export const submitEvaluation = mutation({
  args: {
    rfsId: v.id("rfs"),
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    skillVersion: v.number(),
    contentHash: v.string(),
    reviewerType: reviewerTypeValidator,
    agentRuntime: v.optional(
      v.object({
        provider: v.optional(v.string()),
        model: v.optional(v.string()),
        version: v.optional(v.string()),
      }),
    ),
    targetEnvironment: v.string(),
    vulnerabilityTags: v.array(v.string()),
    rating: v.number(),
    outcome: outcomeValidator,
    confidence: confidenceValidator,
    evidenceType: evidenceTypeValidator,
    evidenceSummary: v.string(),
    evidenceReferences: v.array(v.string()),
    reviewText: v.string(),
  },
  returns: v.object({
    evaluationEventId: v.id("evaluationEvents"),
    nextState: rfsStatusValidator,
    assessmentStatus: payoutAssessmentStatusValidator,
    weightBps: v.number(),
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("POST /api/v2/rfs/{rfsId}/evaluations");
    const userId = await requireAuthedUserId(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    if (rfs.status !== "evaluation_open" && rfs.status !== "disputed") {
      throw new ConvexError({ code: "INVALID_STATE", message: "RFS is not open for evaluation." });
    }
    if (!(await reviewerEligibleForPayoutImpact(ctx, rfs, userId))) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the RFS author or backers can submit payout-impacting evaluations.",
      });
    }
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new ConvexError({ code: "INVALID_RATING", message: "rating must be an integer from 1 to 5." });
    }

    const skillVersion = await ctx.db.get(args.skillVersionId);
    if (
      !skillVersion ||
      skillVersion.rfsId !== args.rfsId ||
      skillVersion.skillId !== args.skillId ||
      skillVersion.version !== args.skillVersion ||
      skillVersion.contentHash !== args.contentHash
    ) {
      throw new ConvexError({
        code: "INVALID_SKILL_VERSION",
        message: "Evaluation must target the current immutable skill version and content hash.",
      });
    }

    const latestVersion = await getLatestSkillVersion(ctx, args.skillId);
    if (!latestVersion || latestVersion._id !== args.skillVersionId) {
      throw new ConvexError({
        code: "INVALID_SKILL_VERSION",
        message: "Evaluation must target the current skill version.",
      });
    }

    const existingEvaluation = await ctx.db
      .query("evaluationEvents")
      .withIndex("by_reviewer_skillVersion", (q) =>
        q.eq("reviewerIdentityId", userId).eq("skillVersionId", args.skillVersionId),
      )
      .first();
    if (existingEvaluation) {
      throw new ConvexError({
        code: "DUPLICATE_EVALUATION",
        message: "You have already evaluated this skill version.",
      });
    }

    const evidenceSummary = args.evidenceSummary.trim();
    if (!evidenceSummary) {
      throw new ConvexError({ code: "INVALID_EVIDENCE", message: "Evidence summary is required." });
    }

    const reviewerReputation = await ctx.db
      .query("reviewerReputations")
      .withIndex("by_reviewerIdentity", (q) => q.eq("reviewerIdentityId", userId))
      .first();
    const reviewerTrustBps = Math.min(
      10_000,
      Math.max(0, reviewerReputation?.globalTrustScore ?? 7_000),
    );
    const strengthBps = Math.min(10_000, Math.max(0, evidenceStrengthBps(args.evidenceType)));
    const confidenceWeightBps = Math.min(
      10_000,
      Math.max(0, confidenceBps(args.confidence)),
    );
    const weightBps = Math.round((reviewerTrustBps * strengthBps * confidenceWeightBps) / 100_000_000);
    const payoutImpact = args.outcome === "harmful"
      ? "harmful"
      : isNegativeOutcome(args.outcome, args.rating)
        ? "negative"
        : isPositiveOutcome(args.outcome, args.rating)
          ? "positive"
          : "none";

    const evaluationEventId = await ctx.db.insert("evaluationEvents", {
      skillId: args.skillId,
      skillVersionId: args.skillVersionId,
      skillVersion: args.skillVersion,
      contentHash: args.contentHash,
      rfsId: args.rfsId,
      reviewerIdentityId: userId,
      reviewerType: args.reviewerType,
      agentRuntime: args.agentRuntime,
      targetEnvironment: args.targetEnvironment.trim(),
      vulnerabilityTags: args.vulnerabilityTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      rating: args.rating,
      outcome: args.outcome,
      confidence: args.confidence,
      evidenceType: args.evidenceType,
      evidenceSummary,
      evidenceReferences: args.evidenceReferences.map((reference) => reference.trim()).filter(Boolean),
      reviewText: args.reviewText.trim(),
      weightBps,
      payoutImpact,
      createdAt: Date.now(),
    });

    if (reviewerReputation) {
      await ctx.db.patch(reviewerReputation._id, {
        verifiedEvaluationsCount: reviewerReputation.verifiedEvaluationsCount + 1,
        lastActiveAt: Date.now(),
      });
    } else {
      await ctx.db.insert("reviewerReputations", {
        reviewerIdentityId: userId,
        globalTrustScore: 7_000,
        tagTrustScores: [],
        verifiedEvaluationsCount: 1,
        disputedEvaluationsCount: 0,
        sybilRiskScore: 0,
        lastActiveAt: Date.now(),
      });
    }

    const assessment = await getLatestAssessmentOrThrow(ctx, args.rfsId);
    if ((payoutImpact === "negative" || payoutImpact === "harmful") && rfs.status !== "disputed") {
      await ctx.db.patch(rfs._id, { status: "disputed" });
      await ctx.db.patch(assessment._id, {
        status: "disputed",
        assessmentReason:
          "A negative evidence-backed review opened a dispute. Payout is held; reduction or blocking still requires independent corroboration.",
      });
      return {
        evaluationEventId,
        nextState: "disputed" as const,
        assessmentStatus: "disputed" as const,
        weightBps,
      };
    }

    return {
      evaluationEventId,
      nextState: rfs.status,
      assessmentStatus: assessment.status,
      weightBps,
    };
  },
});

/** @deprecated Requester force-close is removed. Lifecycle workers close policy-v2 windows. */
export const closeEvaluation = mutation({
  args: {
    rfsId: v.id("rfs"),
    force: v.optional(v.boolean()),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    nextState: rfsStatusValidator,
    assessmentStatus: payoutAssessmentStatusValidator,
    qualityMultiplierBps: v.number(),
    finalPayoutBaseUnits: v.int64(),
    assessmentReason: v.string(),
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/rfs/{rfsId}/events");
    const userId = await requireAuthedUserId(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    await assertCanViewEvaluation(ctx, rfs, userId);

    if (args.force === true && userId !== rfs.authorUserId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the RFS author can force close the evaluation window.",
      });
    }

    if (rfs.status !== "evaluation_open" && rfs.status !== "disputed") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Evaluation is not open." });
    }

    const { skill, latestVersion } = await getSkillAndLatestVersion(ctx, rfs._id);
    const assessment = await getLatestAssessmentOrThrow(ctx, rfs._id);
    if (Date.now() < latestVersion.evaluationDeadline && args.force !== true) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Evaluation window is still open.",
      });
    }

    const events = await ctx.db
      .query("evaluationEvents")
      .withIndex("by_skillVersionId", (q) => q.eq("skillVersionId", latestVersion._id))
      .collect();

    const strongEvents = events.filter((event) => event.evidenceType !== "freeform" && event.weightBps >= 4_000);
    const positiveReviewers = new Set(
      strongEvents
        .filter((event) => isPositiveOutcome(event.outcome, event.rating))
        .map((event) => event.reviewerIdentityId),
    );
    const negativeReviewers = new Set(
      strongEvents
        .filter((event) => isNegativeOutcome(event.outcome, event.rating))
        .map((event) => event.reviewerIdentityId),
    );
    const harmfulReviewers = new Set(
      strongEvents
        .filter((event) => event.outcome === "harmful")
        .map((event) => event.reviewerIdentityId),
    );

    let status: "claimable" | "reduced" | "blocked" | "disputed" = "claimable";
    let nextState: "published" | "revision_requested" | "rejected" | "disputed" = "published";
    let multiplierBps = latestVersion.version > 1 ? 9_000 : 10_000;
    let reason =
      latestVersion.version > 1
        ? "Accepted after revision. MVP recovery is capped at 90%."
        : "Accepted. No independently corroborated evidence justified reduction or blocking.";
    let final = true;

    if (harmfulReviewers.size >= 2) {
      status = "blocked";
      nextState = "rejected";
      multiplierBps = 0;
      reason = "Blocked after two independent evidence-backed harmful evaluations.";
    } else if (negativeReviewers.size >= 2 && latestVersion.version === 1) {
      status = "disputed";
      nextState = "revision_requested";
      multiplierBps = 0;
      reason = "Revision requested after independently corroborated evidence showed the skill was incomplete or ineffective.";
      final = false;
    } else if (negativeReviewers.size >= 2 && latestVersion.version > 1) {
      status = "reduced";
      nextState = "published";
      multiplierBps = 7_500;
      reason = "Revision was useful but still incomplete after independent evidence-backed evaluation; payout reduced without formal partial-payout math.";
    } else if (negativeReviewers.size === 1 && positiveReviewers.size === 0) {
      status = "disputed";
      nextState = "disputed";
      multiplierBps = 0;
      reason = "One negative review cannot reduce or block payout. Submission remains disputed pending corroboration or manual review.";
      final = false;
    }

    await finalizeAssessment(ctx, {
      rfs,
      skill,
      skillVersion: latestVersion,
      assessment,
      status,
      rfsStatus: nextState,
      multiplierBps,
      reason,
      final,
    });

    return {
      rfsId: rfs._id,
      nextState,
      assessmentStatus: status,
      qualityMultiplierBps: multiplierBps,
      finalPayoutBaseUnits:
        (assessment.basePayoutBaseUnits * BigInt(multiplierBps)) / BigInt(10_000),
      assessmentReason: reason,
    };
  },
});

/** @deprecated Policy v1 is retired. Use POST /api/v2/rfs/{rfsId}/disputes. */
export const openDispute = mutation({
  args: {
    rfsId: v.id("rfs"),
    reason: v.string(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    nextState: rfsStatusValidator,
    assessmentStatus: payoutAssessmentStatusValidator,
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("POST /api/v2/rfs/{rfsId}/disputes");
    const userId = await requireAuthedUserId(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    await assertCanViewEvaluation(ctx, rfs, userId);

    if (rfs.status !== "evaluation_open" && rfs.status !== "disputed") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Dispute can only be opened while the evaluation window is open.",
      });
    }

    const assessment = await getLatestAssessmentOrThrow(ctx, rfs._id);
    if (assessment.status === "claimed" || assessment.evaluationWindowClosedAt !== undefined) {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Dispute cannot be opened after the evaluation has been finalized or claimed.",
      });
    }

    const reason = args.reason.trim();
    if (!reason) {
      throw new ConvexError({ code: "INVALID_REASON", message: "Dispute reason is required." });
    }

    await ctx.db.patch(rfs._id, { status: "disputed" });
    await ctx.db.patch(assessment._id, {
      status: "disputed",
      assessmentReason: `Disputed: ${reason}`,
    });

    return {
      rfsId: rfs._id,
      nextState: "disputed" as const,
      assessmentStatus: "disputed" as const,
    };
  },
});
