import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const rfsStatus = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("assigned"),
  v.literal("submitted"),
  v.literal("evaluation_open"),
  v.literal("accepted"),
  v.literal("revision_requested"),
  v.literal("disputed"),
  v.literal("rejected"),
  v.literal("published"),
  v.literal("cancelled"),
  v.literal("fulfilled"),
);

const skillStatus = v.union(
  v.literal("draft"),
  v.literal("submitted"),
  v.literal("evaluation_open"),
  v.literal("accepted"),
  v.literal("revision_requested"),
  v.literal("disputed"),
  v.literal("rejected"),
  v.literal("published"),
);

const reviewerType = v.union(
  v.literal("agent"),
  v.literal("human"),
  v.literal("platform_evaluator"),
);

const evaluationOutcome = v.union(
  v.literal("resolved"),
  v.literal("improved"),
  v.literal("no_effect"),
  v.literal("harmful"),
  v.literal("unable_to_apply"),
);

const evaluationConfidence = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

const evidenceType = v.union(
  v.literal("test_result"),
  v.literal("scanner_result"),
  v.literal("exploit_reproduction"),
  v.literal("diff_attestation"),
  v.literal("human_review"),
  v.literal("freeform"),
);

const payoutAssessmentStatus = v.union(
  v.literal("pending"),
  v.literal("claimable"),
  v.literal("reduced"),
  v.literal("blocked"),
  v.literal("disputed"),
  v.literal("manually_resolved"),
  v.literal("claimed"),
);

export default defineSchema({
  rfs: defineTable({
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
    status: rfsStatus,
  })
    .index("by_status", ["status"])
    .index("by_author", ["authorUserId"])
    .index("by_claimant", ["claimantUserId"]),

  contributions: defineTable({
    rfsId: v.id("rfs"),
    backerUserId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_backer", ["backerUserId"])
    .index("by_challengeId", ["challengeId"]),

  skills: defineTable({
    rfsId: v.id("rfs"),
    authorUserId: v.string(),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    purchasePriceBaseUnits: v.int64(),
    latestVersion: v.optional(v.number()),
    latestContentHash: v.optional(v.string()),
    status: skillStatus,
  })
    .index("by_rfs", ["rfsId"])
    .index("by_status", ["status"]),

  skillVersions: defineTable({
    skillId: v.id("skills"),
    rfsId: v.id("rfs"),
    version: v.number(),
    contentHash: v.string(),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    purchasePriceBaseUnits: v.int64(),
    authorUserId: v.string(),
    status: skillStatus,
    submittedAt: v.number(),
    evaluationDeadline: v.number(),
    acceptedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    revisionOfVersion: v.optional(v.number()),
  })
    .index("by_skill", ["skillId"])
    .index("by_skill_version", ["skillId", "version"])
    .index("by_rfs_status", ["rfsId", "status"])
    .index("by_contentHash", ["contentHash"]),

  evaluationEvents: defineTable({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    skillVersion: v.number(),
    contentHash: v.string(),
    rfsId: v.id("rfs"),
    reviewerIdentityId: v.string(),
    reviewerType,
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
    outcome: evaluationOutcome,
    confidence: evaluationConfidence,
    evidenceType,
    evidenceSummary: v.string(),
    evidenceReferences: v.array(v.string()),
    reviewText: v.string(),
    weightBps: v.number(),
    payoutImpact: v.union(
      v.literal("none"),
      v.literal("positive"),
      v.literal("negative"),
      v.literal("harmful"),
    ),
    createdAt: v.number(),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_skill_version", ["skillId", "skillVersion"])
    .index("by_skillVersionId", ["skillVersionId"])
    .index("by_reviewer", ["reviewerIdentityId"]),

  reviewerReputations: defineTable({
    reviewerIdentityId: v.string(),
    globalTrustScore: v.number(),
    tagTrustScores: v.array(
      v.object({
        tag: v.string(),
        trustScore: v.number(),
      }),
    ),
    verifiedEvaluationsCount: v.number(),
    disputedEvaluationsCount: v.number(),
    sybilRiskScore: v.number(),
    lastActiveAt: v.number(),
  })
    .index("by_reviewerIdentity", ["reviewerIdentityId"]),

  authorReputations: defineTable({
    authorUserId: v.string(),
    tag: v.string(),
    qualityScore: v.number(),
    deliveryReliabilityScore: v.number(),
    revisionRate: v.number(),
    disputeRate: v.number(),
    acceptedSkillCount: v.number(),
    rejectedSkillCount: v.number(),
    weightedInstallCount: v.number(),
    weightedOutcomeScore: v.number(),
    confidence: v.union(v.literal("none"), v.literal("low"), v.literal("medium"), v.literal("high")),
    lastUpdatedAt: v.number(),
  })
    .index("by_author_tag", ["authorUserId", "tag"])
    .index("by_tag", ["tag"]),

  payoutAssessments: defineTable({
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
    status: payoutAssessmentStatus,
    assessmentReason: v.string(),
    evaluationWindowOpenedAt: v.number(),
    evaluationWindowClosedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_status", ["status"])
    .index("by_author_status", ["authorUserId", "status"])
    .index("by_skill_version", ["skillId", "skillVersion"]),

  purchases: defineTable({
    skillId: v.id("skills"),
    buyerUserId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
  })
    .index("by_skill", ["skillId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_challengeId", ["challengeId"]),

  accessGrants: defineTable({
    userId: v.string(),
    skillId: v.id("skills"),
    source: v.union(
      v.literal("backer_unlock"),
      v.literal("purchase"),
      v.literal("admin"),
      v.literal("evaluation"),
    ),
  })
    .index("by_user_skill", ["userId", "skillId"])
    .index("by_skill", ["skillId"]),

  payoutLedger: defineTable({
    rfsId: v.id("rfs"),
    researcherUserId: v.string(),
    grossAmountBaseUnits: v.int64(),
    platformFeeBaseUnits: v.int64(),
    netAmountBaseUnits: v.int64(),
    status: v.union(
      v.literal("locked"),
      v.literal("claimable"),
      v.literal("reduced"),
      v.literal("blocked"),
      v.literal("claimed"),
    ),
    receiptReference: v.optional(v.string()),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_researcher", ["researcherUserId"])
    .index("by_status", ["status"]),

  payoutEntries: defineTable({
    rfsId: v.id("rfs"),
    researcherUserId: v.string(),
    source: v.union(v.literal("funding"), v.literal("purchase")),
    grossAmountBaseUnits: v.int64(),
    platformFeeBaseUnits: v.int64(),
    netAmountBaseUnits: v.int64(),
    status: v.union(v.literal("claimable"), v.literal("claimed"), v.literal("blocked")),
    claimGroupId: v.optional(v.string()),
  })
    .index("by_researcher_status", ["researcherUserId", "status"])
    .index("by_rfs", ["rfsId"])
    .index("by_claimGroup", ["claimGroupId"]),

  paymentEvents: defineTable({
    type: v.union(
      v.literal("fund"),
      v.literal("buy"),
      v.literal("payout_claim"),
      v.literal("payout_refund"),
    ),
    resourceId: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    status: v.string(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_type_resource", ["type", "resourceId"]),
});
