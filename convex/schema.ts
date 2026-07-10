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
    policyVersion: v.optional(v.number()),
    riskTier: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    workEscrowBaseUnits: v.optional(v.int64()),
    reviewReserveBaseUnits: v.optional(v.int64()),
    totalFundingTargetBaseUnits: v.optional(v.int64()),
    fundingDeadline: v.optional(v.number()),
    applicationDeadline: v.optional(v.number()),
    applicationWindowRound: v.optional(v.number()),
    deliveryDeadline: v.optional(v.number()),
    revisionDeadline: v.optional(v.number()),
    selectedApplicationId: v.optional(v.id("rfsApplications")),
    humanReviewRequired: v.optional(v.boolean()),
    currentRevisionId: v.optional(v.id("rfsRevisions")),
    contractDigest: v.optional(v.string()),
    resourceVersion: v.optional(v.number()),
    reservedFundingBaseUnits: v.optional(v.int64()),
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
    paymentIntentId: v.optional(v.id("paymentIntents")),
    contractRevisionId: v.optional(v.id("rfsRevisions")),
    policyVersion: v.optional(v.number()),
    payerWalletId: v.optional(v.id("principalWallets")),
    refundedAt: v.optional(v.number()),
    appliedAmountBaseUnits: v.optional(v.int64()),
    refundAmountBaseUnits: v.optional(v.int64()),
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
    policyVersion: v.optional(v.number()),
    publishedVersionId: v.optional(v.id("skillVersions")),
    quarantineState: v.optional(
      v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
    ),
    safeFallbackVersionId: v.optional(v.id("skillVersions")),
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
    policyVersion: v.optional(v.number()),
    digestAlgorithm: v.optional(v.union(v.literal("legacy_fnv1a64"), v.literal("sha256"))),
    quarantineState: v.optional(
      v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
    ),
    legacyImported: v.optional(v.boolean()),
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
    policyVersion: v.optional(v.number()),
    phase: v.optional(v.union(v.literal("payout_window"), v.literal("post_publish"))),
    principalId: v.optional(v.string()),
    identityClusterId: v.optional(v.id("identityClusters")),
    relevantTagTrustBps: v.optional(v.number()),
    supersedesEvaluationId: v.optional(v.id("evaluationEvents")),
    active: v.optional(v.boolean()),
    publicReviewId: v.optional(v.id("postUseReviews")),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_skill_version", ["skillId", "skillVersion"])
    .index("by_skillVersionId", ["skillVersionId"])
    .index("by_reviewer", ["reviewerIdentityId"])
    .index("by_reviewer_skillVersion", ["reviewerIdentityId", "skillVersionId"]),

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
    policyVersion: v.optional(v.number()),
    workflowStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("evaluating"),
        v.literal("held"),
        v.literal("human_review"),
        v.literal("finalized"),
      ),
    ),
    decisionKind: v.optional(
      v.union(
        v.literal("accepted"),
        v.literal("partial"),
        v.literal("rejected"),
        v.literal("harmful"),
        v.literal("abandoned"),
      ),
    ),
    passedWeightBps: v.optional(v.number()),
    grossAuthorBaseUnits: v.optional(v.int64()),
    netAuthorBaseUnits: v.optional(v.int64()),
    refundPoolBaseUnits: v.optional(v.int64()),
    decidedAt: v.optional(v.number()),
    resourceVersion: v.optional(v.number()),
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
    skillVersionId: v.optional(v.id("skillVersions")),
    paymentIntentId: v.optional(v.id("paymentIntents")),
    buyerWalletId: v.optional(v.id("principalWallets")),
    status: v.optional(
      v.union(v.literal("confirmed"), v.literal("refunded"), v.literal("revoked")),
    ),
  })
    .index("by_skill", ["skillId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_challengeId", ["challengeId"]),

  accessGrants: defineTable({
    userId: v.string(),
    principalId: v.optional(v.string()),
    skillId: v.id("skills"),
    source: v.union(
      v.literal("backer_unlock"),
      v.literal("purchase"),
      v.literal("admin"),
      v.literal("evaluation"),
    ),
    skillVersionId: v.optional(v.id("skillVersions")),
    active: v.optional(v.boolean()),
    redeemedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
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

  rfsRevisions: defineTable({
    rfsId: v.id("rfs"),
    revisionNumber: v.number(),
    authorPrincipalId: v.string(),
    title: v.string(),
    description: v.string(),
    scope: v.string(),
    tags: v.array(v.string()),
    targetEnvironments: v.array(v.string()),
    criteriaDigest: v.string(),
    fixtureDigest: v.optional(v.string()),
    workEscrowBaseUnits: v.int64(),
    reviewReserveBaseUnits: v.int64(),
    totalFundingTargetBaseUnits: v.int64(),
    tokenAddress: v.string(),
    network: v.string(),
    fundingDeadline: v.number(),
    deliveryLimitMs: v.number(),
    contractDigest: v.string(),
    policyVersion: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("challenged"),
      v.literal("committed"),
      v.literal("superseded"),
      v.literal("cancelled"),
    ),
    challengedAt: v.optional(v.number()),
    frozenAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_rfs_and_revisionNumber", ["rfsId", "revisionNumber"])
    .index("by_rfs_and_status", ["rfsId", "status"]),

  rfsCriteria: defineTable({
    rfsId: v.id("rfs"),
    revisionId: v.id("rfsRevisions"),
    criterionKey: v.string(),
    title: v.string(),
    passConditionKind: v.union(
      v.literal("boolean_assertion"),
      v.literal("numeric_threshold"),
      v.literal("fixture_assertion"),
    ),
    passCondition: v.string(),
    verificationMethod: v.string(),
    weightBps: v.number(),
    requiredForPublication: v.boolean(),
    tags: v.array(v.string()),
    fixtureVersionId: v.optional(v.id("fixtureVersions")),
    createdAt: v.number(),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_revision", ["revisionId"])
    .index("by_revision_and_criterionKey", ["revisionId", "criterionKey"]),

  fixtureVersions: defineTable({
    ownerPrincipalId: v.string(),
    visibility: v.union(v.literal("public"), v.literal("restricted")),
    version: v.number(),
    manifestSha256: v.string(),
    bundleSha256: v.string(),
    environmentContract: v.string(),
    storageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerPrincipalId"])
    .index("by_manifestSha256", ["manifestSha256"]),

  rfsApplications: defineTable({
    rfsId: v.id("rfs"),
    principalId: v.string(),
    identityClusterId: v.id("identityClusters"),
    payoutWalletId: v.id("principalWallets"),
    currentRevisionId: v.optional(v.id("applicationRevisions")),
    etaMs: v.number(),
    bondAcknowledged: v.boolean(),
    state: v.union(
      v.literal("active"),
      v.literal("withdrawn"),
      v.literal("ineligible"),
      v.literal("ranked"),
      v.literal("selected"),
      v.literal("waitlisted"),
      v.literal("rejected"),
    ),
    scoreSnapshotJson: v.optional(v.string()),
    qualityScoreBps: v.optional(v.number()),
    deliveryScoreBps: v.optional(v.number()),
    verificationScoreBps: v.optional(v.number()),
    endorsementScoreBps: v.optional(v.number()),
    etaScoreBps: v.optional(v.number()),
    riskPenaltyBps: v.optional(v.number()),
    totalScoreBps: v.optional(v.number()),
    rank: v.optional(v.number()),
    tieBreakJson: v.optional(v.string()),
    bondRequired: v.optional(v.boolean()),
    policyVersion: v.number(),
    resourceVersion: v.number(),
    submittedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_rfs_and_state", ["rfsId", "state"])
    .index("by_principal", ["principalId"])
    .index("by_cluster_and_rfs", ["identityClusterId", "rfsId"]),

  applicationRevisions: defineTable({
    applicationId: v.id("rfsApplications"),
    revisionNumber: v.number(),
    principalId: v.string(),
    etaMs: v.number(),
    environment: v.string(),
    criterionPlansJson: v.string(),
    evidenceMethod: v.string(),
    relevantWorkReferences: v.array(v.string()),
    bondAcknowledged: v.boolean(),
    payloadDigest: v.string(),
    resourceVersion: v.number(),
    withdrawn: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_application_and_revisionNumber", ["applicationId", "revisionNumber"])
    .index("by_application", ["applicationId"]),

  applicationEndorsements: defineTable({
    rfsId: v.id("rfs"),
    applicationId: v.id("rfsApplications"),
    principalId: v.string(),
    identityClusterId: v.id("identityClusters"),
    role: v.union(v.literal("requester"), v.literal("backer")),
    contributionShareNumerator: v.int64(),
    contributionShareDenominator: v.int64(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_application", ["applicationId"])
    .index("by_application_and_principal", ["applicationId", "principalId"]),

  principalWallets: defineTable({
    principalId: v.string(),
    chain: v.string(),
    address: v.string(),
    verificationChallenge: v.string(),
    verificationDigest: v.string(),
    verifiedAt: v.number(),
    primary: v.boolean(),
    status: v.union(v.literal("active"), v.literal("rotated"), v.literal("revoked")),
    rotatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_principal", ["principalId"])
    .index("by_chain_and_address", ["chain", "address"])
    .index("by_principal_and_primary", ["principalId", "primary"]),

  walletVerificationChallenges: defineTable({
    principalId: v.string(),
    chain: v.string(),
    chainId: v.number(),
    address: v.string(),
    nonce: v.string(),
    domain: v.string(),
    uri: v.string(),
    message: v.string(),
    messageDigest: v.string(),
    state: v.union(v.literal("pending"), v.literal("consumed"), v.literal("expired")),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_principal_and_state", ["principalId", "state"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),

  principalSigningKeys: defineTable({
    principalId: v.string(),
    publicKey: v.string(),
    algorithm: v.union(v.literal("ed25519"), v.literal("eip191")),
    purpose: v.union(v.literal("proof_manifest"), v.literal("wallet_verification")),
    verifiedAt: v.number(),
    activeFrom: v.number(),
    activeUntil: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_principal_and_purpose", ["principalId", "purpose"])
    .index("by_publicKey", ["publicKey"]),

  proofKeyChallenges: defineTable({
    principalId: v.string(),
    publicKey: v.string(),
    algorithm: v.literal("ed25519"),
    purpose: v.literal("proof_manifest"),
    challenge: v.string(),
    challengeDigest: v.string(),
    state: v.union(v.literal("pending"), v.literal("consumed"), v.literal("expired")),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_principal_and_state", ["principalId", "state"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),

  publicProfiles: defineTable({
    principalId: v.string(),
    handle: v.string(),
    displayName: v.string(),
    bio: v.optional(v.string()),
    links: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_principal", ["principalId"])
    .index("by_handle", ["handle"]),

  agentDelegations: defineTable({
    principalId: v.string(),
    apiKeyId: v.string(),
    name: v.string(),
    permissions: v.array(v.string()),
    actions: v.array(v.string()),
    resourceAllowlist: v.array(v.string()),
    tagAllowlist: v.array(v.string()),
    perTransactionCapBaseUnits: v.optional(v.int64()),
    rolling24HourCapBaseUnits: v.optional(v.int64()),
    lifetimeCapBaseUnits: v.optional(v.int64()),
    reservedBaseUnits: v.int64(),
    consumedRollingBaseUnits: v.int64(),
    consumedLifetimeBaseUnits: v.int64(),
    rollingWindowStartedAt: v.number(),
    tokenAddress: v.optional(v.string()),
    network: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_apiKeyId", ["apiKeyId"])
    .index("by_principal_and_status", ["principalId", "status"]),

  apiKeyAuthorizations: defineTable({
    principalId: v.string(),
    apiKeyId: v.string(),
    permissions: v.array(v.string()),
    authorizationDigest: v.string(),
    issuedAt: v.number(),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_apiKeyId", ["apiKeyId"])
    .index("by_principal", ["principalId"]),

  privilegedSessionAttestations: defineTable({
    principalId: v.string(),
    sessionId: v.string(),
    authenticationMethod: v.literal("passkey"),
    authenticatedAt: v.number(),
    expiresAt: v.number(),
    authorizationDigest: v.string(),
    createdAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_principal_and_expiresAt", ["principalId", "expiresAt"]),

  humanActionRequests: defineTable({
    ownerPrincipalId: v.string(),
    originatingApiKeyId: v.optional(v.string()),
    actionType: v.union(
      v.literal("grant_permission"),
      v.literal("authorize_contract"),
      v.literal("authorize_spend"),
      v.literal("verify_wallet"),
      v.literal("confirm_high_value_assignment"),
      v.literal("adjudicate_evaluation"),
      v.literal("confirm_abandonment"),
      v.literal("moderate_post_use_review"),
      v.literal("correct_prebroadcast_destination"),
      v.literal("place_legal_hold"),
    ),
    resourceType: v.string(),
    resourceId: v.string(),
    payloadDigest: v.string(),
    requestedBoundsJson: v.string(),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("consumed"),
    ),
    expiresAt: v.number(),
    resolvedByPrincipalId: v.optional(v.string()),
    resolvedSessionId: v.optional(v.string()),
    resolutionReference: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_owner_and_status", ["ownerPrincipalId", "status"])
    .index("by_originatingApiKeyId", ["originatingApiKeyId"])
    .index("by_resource", ["resourceType", "resourceId"]),

  accountRecoveryRequests: defineTable({
    principalId: v.string(),
    priorWalletId: v.id("principalWallets"),
    walletProofDigest: v.string(),
    status: v.union(
      v.literal("pending_cooling"),
      v.literal("pending_approvals"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("completed"),
    ),
    coolingOffUntil: v.number(),
    firstOperatorPrincipalId: v.optional(v.string()),
    secondOperatorPrincipalId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    revokedKeyCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_principal_and_status", ["principalId", "status"])
    .index("by_status_and_coolingOffUntil", ["status", "coolingOffUntil"]),

  accountRecoveryChallenges: defineTable({
    principalId: v.string(),
    walletId: v.id("principalWallets"),
    challenge: v.string(),
    challengeDigest: v.string(),
    state: v.union(v.literal("pending"), v.literal("consumed"), v.literal("expired")),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_principal_and_state", ["principalId", "state"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),

  platformRoles: defineTable({
    principalId: v.string(),
    role: v.union(
      v.literal("trusted_reviewer"),
      v.literal("security_adjudicator"),
      v.literal("security_operator"),
      v.literal("platform_operator"),
    ),
    tags: v.array(v.string()),
    grantedByPrincipalId: v.string(),
    activeFrom: v.number(),
    activeUntil: v.number(),
    revokedAt: v.optional(v.number()),
    reason: v.string(),
  })
    .index("by_principal_and_role", ["principalId", "role"])
    .index("by_role_and_activeUntil", ["role", "activeUntil"]),

  identityRiskSignals: defineTable({
    principalId: v.string(),
    signalType: v.union(
      v.literal("network_bucket"),
      v.literal("payment_wallet"),
      v.literal("api_key_lineage"),
      v.literal("account_age"),
      v.literal("author_reviewer_pair"),
      v.literal("timing_correlation"),
    ),
    valueHmac: v.string(),
    confidenceBps: v.number(),
    provenance: v.string(),
    observedFrom: v.number(),
    observedUntil: v.number(),
    expiresAt: v.number(),
  })
    .index("by_principal", ["principalId"])
    .index("by_signalType_and_valueHmac", ["signalType", "valueHmac"]),

  identityClusters: defineTable({
    status: v.union(v.literal("active"), v.literal("split"), v.literal("merged")),
    confidenceBps: v.number(),
    reasons: v.array(v.string()),
    manualOverride: v.boolean(),
    overrideExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_status", ["status"]),

  identityClusterMemberships: defineTable({
    clusterId: v.id("identityClusters"),
    principalId: v.string(),
    confidenceBps: v.number(),
    reasons: v.array(v.string()),
    activeFrom: v.number(),
    activeUntil: v.optional(v.number()),
    manuallyOverriddenBy: v.optional(v.string()),
  })
    .index("by_principal", ["principalId"])
    .index("by_cluster", ["clusterId"])
    .index("by_principal_and_activeUntil", ["principalId", "activeUntil"]),

  identityClusterEvents: defineTable({
    actorPrincipalId: v.string(),
    eventType: v.union(v.literal("merge"), v.literal("split"), v.literal("override_expired")),
    sourceClusterIds: v.array(v.id("identityClusters")),
    resultingClusterIds: v.array(v.id("identityClusters")),
    affectedPrincipalIds: v.array(v.string()),
    reason: v.string(),
    overrideExpiresAt: v.optional(v.number()),
    occurredAt: v.number(),
  })
    .index("by_actor", ["actorPrincipalId"])
    .index("by_eventType", ["eventType"]),

  paymentIntents: defineTable({
    resourceType: v.union(v.literal("rfs_funding"), v.literal("skill_purchase"), v.literal("author_bond")),
    resourceId: v.string(),
    skillVersionId: v.optional(v.id("skillVersions")),
    principalId: v.string(),
    walletId: v.id("principalWallets"),
    payerAddressSnapshot: v.string(),
    delegationId: v.optional(v.id("agentDelegations")),
    tokenAddress: v.string(),
    network: v.string(),
    amountBaseUnits: v.int64(),
    contractDigest: v.string(),
    challengeId: v.optional(v.string()),
    challengeEnvelope: v.optional(v.string()),
    receiptReference: v.optional(v.string()),
    state: v.union(
      v.literal("reserved"),
      v.literal("challenged"),
      v.literal("confirmed"),
      v.literal("expired"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
    idempotencyKey: v.string(),
    policyVersion: v.number(),
    expiresAt: v.number(),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
    resultResourceType: v.optional(v.string()),
    resultResourceId: v.optional(v.string()),
  })
    .index("by_principal_resource_and_state", ["principalId", "resourceType", "resourceId", "state"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_challengeId", ["challengeId"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),

  idempotencyRecords: defineTable({
    principalId: v.string(),
    apiVersion: v.string(),
    action: v.string(),
    idempotencyKey: v.string(),
    requestDigest: v.string(),
    resultResourceType: v.optional(v.string()),
    resultResourceId: v.optional(v.string()),
    operationId: v.optional(v.id("apiOperations")),
    errorCode: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_principal_action_and_key", ["principalId", "action", "idempotencyKey"])
    .index("by_expiresAt", ["expiresAt"]),

  apiOperations: defineTable({
    principalId: v.string(),
    command: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("succeeded"), v.literal("failed"), v.literal("cancelled")),
    progressBps: v.number(),
    resultResourceId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    cancellable: v.boolean(),
    nextPollAt: v.number(),
    eventSequence: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_principal_and_status", ["principalId", "status"])
    .index("by_resource", ["resourceType", "resourceId"]),

  activityEvents: defineTable({
    principalId: v.string(),
    role: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    eventType: v.string(),
    publicSummary: v.string(),
    capabilityReference: v.optional(v.string()),
    sequence: v.number(),
    occurredAt: v.number(),
  })
    .index("by_principal_and_sequence", ["principalId", "sequence"])
    .index("by_resource_and_sequence", ["resourceType", "resourceId", "sequence"]),

  artifactUploadIntents: defineTable({
    principalId: v.string(),
    rfsId: v.id("rfs"),
    skillVersionId: v.id("skillVersions"),
    criterionId: v.optional(v.id("rfsCriteria")),
    evaluationId: v.optional(v.id("evaluationEvents")),
    expectedMimeType: v.string(),
    maximumBytes: v.number(),
    state: v.union(v.literal("issued"), v.literal("uploaded"), v.literal("expired"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_principal_and_state", ["principalId", "state"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),

  evidenceArtifacts: defineTable({
    ownerPrincipalId: v.string(),
    rfsId: v.id("rfs"),
    skillVersionId: v.id("skillVersions"),
    criterionId: v.optional(v.id("rfsCriteria")),
    evaluationId: v.optional(v.id("evaluationEvents")),
    classification: v.union(v.literal("public"), v.literal("restricted")),
    restrictionReason: v.optional(v.union(v.literal("private_source"), v.literal("live_exploit"), v.literal("credentials"), v.literal("coordinated_disclosure"))),
    verificationState: v.union(v.literal("submitted"), v.literal("verified"), v.literal("failed"), v.literal("expired")),
    scanState: v.union(v.literal("pending"), v.literal("clean"), v.literal("quarantined"), v.literal("failed")),
    plaintextSha256: v.string(),
    ciphertextSha256: v.string(),
    ciphertextStorageId: v.id("_storage"),
    wrappedDataKey: v.string(),
    nonce: v.string(),
    authenticationTag: v.string(),
    kmsKeyVersion: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    publicRedaction: v.optional(v.string()),
    proofManifest: v.optional(v.string()),
    proofSignature: v.optional(v.string()),
    signingKeyId: v.optional(v.id("principalSigningKeys")),
    verifiedByPrincipalId: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    retentionDeleteAt: v.number(),
    legalHold: v.boolean(),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_evaluation", ["evaluationId"])
    .index("by_retentionDeleteAt", ["retentionDeleteAt"])
    .index("by_skillVersion", ["skillVersionId"]),

  evidenceAccessEvents: defineTable({
    artifactId: v.id("evidenceArtifacts"),
    actorPrincipalId: v.string(),
    action: v.union(v.literal("grant"), v.literal("read"), v.literal("failed_read"), v.literal("redact"), v.literal("delete"), v.literal("legal_hold")),
    reason: v.string(),
    result: v.union(v.literal("allowed"), v.literal("denied"), v.literal("completed"), v.literal("failed")),
    occurredAt: v.number(),
  })
    .index("by_artifact", ["artifactId"])
    .index("by_actor", ["actorPrincipalId"]),

  evaluationCriterionResults: defineTable({
    evaluationId: v.id("evaluationEvents"),
    criterionId: v.id("rfsCriteria"),
    result: v.union(v.literal("passed"), v.literal("failed"), v.literal("not_run")),
    artifactIds: v.array(v.id("evidenceArtifacts")),
    verifierState: v.union(v.literal("submitted"), v.literal("verified"), v.literal("failed"), v.literal("expired")),
    createdAt: v.number(),
  })
    .index("by_evaluation", ["evaluationId"])
    .index("by_evaluation_and_criterion", ["evaluationId", "criterionId"]),

  reviewAssignments: defineTable({
    rfsId: v.id("rfs"),
    assessmentId: v.id("payoutAssessments"),
    reviewerPrincipalId: v.optional(v.string()),
    reason: v.union(v.literal("insufficient_evidence"), v.literal("harmful_hold"), v.literal("high_value"), v.literal("conflicting_evidence"), v.literal("appeal")),
    tags: v.array(v.string()),
    dueAt: v.number(),
    reserveFeeBaseUnits: v.int64(),
    state: v.union(v.literal("open"), v.literal("accepted"), v.literal("declined"), v.literal("completed"), v.literal("expired")),
    conflictDeclared: v.optional(v.boolean()),
    acceptedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_reviewer_and_state", ["reviewerPrincipalId", "state"])
    .index("by_state_and_dueAt", ["state", "dueAt"])
    .index("by_assessment", ["assessmentId"]),

  disputes: defineTable({
    rfsId: v.id("rfs"),
    assessmentId: v.id("payoutAssessments"),
    triggerType: v.union(v.literal("harmful_hold"), v.literal("high_value"), v.literal("conflicting_evidence"), v.literal("appeal"), v.literal("abandonment")),
    triggeringEvaluationId: v.optional(v.id("evaluationEvents")),
    openedByPrincipalId: v.string(),
    assignedPrincipalId: v.optional(v.string()),
    state: v.union(v.literal("open"), v.literal("assigned"), v.literal("resolved")),
    stickyHold: v.boolean(),
    dueAt: v.number(),
    resolution: v.optional(v.union(v.literal("clear_hold"), v.literal("request_revision"), v.literal("accept_partial"), v.literal("block_harmful"), v.literal("reject_fraud"), v.literal("confirm_abandonment"), v.literal("insufficient_evidence"))),
    publicRationale: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_rfs_and_state", ["rfsId", "state"])
    .index("by_assignedPrincipal_and_state", ["assignedPrincipalId", "state"])
    .index("by_state_and_dueAt", ["state", "dueAt"]),

  disputeEvents: defineTable({
    disputeId: v.id("disputes"),
    actorPrincipalId: v.string(),
    eventType: v.union(v.literal("opened"), v.literal("assigned"), v.literal("evidence_added"), v.literal("resolved"), v.literal("redacted")),
    priorState: v.optional(v.string()),
    nextState: v.string(),
    evidenceArtifactIds: v.array(v.id("evidenceArtifacts")),
    resolution: v.optional(v.string()),
    rationale: v.string(),
    publicRedaction: v.optional(v.string()),
    occurredAt: v.number(),
  }).index("by_dispute", ["disputeId"]),

  assessmentEvents: defineTable({
    assessmentId: v.id("payoutAssessments"),
    rfsId: v.id("rfs"),
    actorPrincipalId: v.optional(v.string()),
    priorState: v.string(),
    nextState: v.string(),
    reason: v.string(),
    evidenceArtifactIds: v.array(v.id("evidenceArtifacts")),
    algorithmInputJson: v.string(),
    algorithmOutputJson: v.string(),
    policyVersion: v.number(),
    correlationId: v.string(),
    occurredAt: v.number(),
  })
    .index("by_assessment", ["assessmentId"])
    .index("by_rfs", ["rfsId"]),

  bondEscrows: defineTable({
    rfsId: v.id("rfs"),
    applicationId: v.id("rfsApplications"),
    principalId: v.string(),
    amountBaseUnits: v.int64(),
    paymentIntentId: v.id("paymentIntents"),
    state: v.union(v.literal("required"), v.literal("funded"), v.literal("refundable"), v.literal("slashed"), v.literal("settled"), v.literal("expired")),
    slashReason: v.optional(v.union(v.literal("first_abandonment"), v.literal("repeated_abandonment"), v.literal("fraud"), v.literal("harmful"))),
    slashBps: v.optional(v.number()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_application", ["applicationId"])
    .index("by_principal_and_state", ["principalId", "state"]),

  bondEvents: defineTable({
    bondEscrowId: v.id("bondEscrows"),
    actorPrincipalId: v.optional(v.string()),
    priorState: v.string(),
    nextState: v.string(),
    reason: v.string(),
    occurredAt: v.number(),
  }).index("by_bondEscrow", ["bondEscrowId"]),

  settlementObligations: defineTable({
    sourceType: v.union(v.literal("rfs_work"), v.literal("review_reserve"), v.literal("bond"), v.literal("purchase_batch"), v.literal("platform_risk_reserve")),
    sourceId: v.string(),
    beneficiaryPrincipalId: v.string(),
    kind: v.union(v.literal("author_payout"), v.literal("platform_fee"), v.literal("reviewer_fee"), v.literal("backer_refund"), v.literal("bond_refund"), v.literal("bond_slash_refund"), v.literal("purchase_earning")),
    amountBaseUnits: v.int64(),
    walletId: v.id("principalWallets"),
    recipientAddressSnapshot: v.string(),
    tokenAddress: v.string(),
    network: v.string(),
    decisionReference: v.string(),
    policyVersion: v.number(),
    state: v.union(v.literal("pending"), v.literal("held"), v.literal("queued"), v.literal("settled"), v.literal("cancelled")),
    createdAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_beneficiary_and_state", ["beneficiaryPrincipalId", "state"])
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_state", ["state"]),

  settlementTransfers: defineTable({
    obligationId: v.id("settlementObligations"),
    batchId: v.optional(v.string()),
    idempotencyKey: v.string(),
    network: v.string(),
    tokenAddress: v.string(),
    senderAddress: v.string(),
    recipientAddress: v.string(),
    amountBaseUnits: v.int64(),
    state: v.union(v.literal("pending"), v.literal("broadcast"), v.literal("confirmed"), v.literal("failed"), v.literal("cancelled")),
    custodyNonce: v.optional(v.string()),
    transactionHash: v.optional(v.string()),
    verifiedReceiptJson: v.optional(v.string()),
    attempts: v.number(),
    errorCode: v.optional(v.string()),
    nextAttemptAt: v.optional(v.number()),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
  })
    .index("by_obligation", ["obligationId"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_state_and_nextAttemptAt", ["state", "nextAttemptAt"])
    .index("by_transactionHash", ["transactionHash"]),

  purchasePayoutBatches: defineTable({
    skillId: v.id("skills"),
    authorPrincipalId: v.string(),
    fromPurchaseCreationTime: v.number(),
    throughPurchaseCreationTime: v.number(),
    grossBaseUnits: v.int64(),
    platformFeeBaseUnits: v.int64(),
    netBaseUnits: v.int64(),
    state: v.union(v.literal("open"), v.literal("obligated"), v.literal("settled"), v.literal("held")),
    createdAt: v.number(),
  })
    .index("by_author_and_state", ["authorPrincipalId", "state"])
    .index("by_skill", ["skillId"]),

  reputationEvents: defineTable({
    subjectType: v.union(v.literal("skill_version"), v.literal("author_tag"), v.literal("reviewer_tag")),
    subjectId: v.string(),
    tag: v.string(),
    sourceType: v.union(v.literal("rfs_evaluation"), v.literal("post_use_review"), v.literal("reviewer_accuracy")),
    sourceId: v.string(),
    finalDecisionId: v.string(),
    score: v.number(),
    signalStrength: v.number(),
    identityClusterId: v.id("identityClusters"),
    occurredAt: v.number(),
    policyVersion: v.number(),
  })
    .index("by_subject_and_tag", ["subjectType", "subjectId", "tag"])
    .index("by_source_and_tag", ["sourceType", "sourceId", "tag"]),

  postUseReviews: defineTable({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    accessGrantId: v.id("accessGrants"),
    reviewerPrincipalId: v.string(),
    identityClusterId: v.id("identityClusters"),
    currentRevisionId: v.optional(v.id("postUseReviewRevisions")),
    rating: v.number(),
    outcome: v.union(v.literal("unable_to_apply"), v.literal("no_effect"), v.literal("improved"), v.literal("resolved"), v.literal("harmful")),
    tags: v.array(v.string()),
    text: v.string(),
    state: v.union(v.literal("pending_reputation"), v.literal("disputed"), v.literal("moderation"), v.literal("finalized"), v.literal("removed")),
    finalizeAt: v.number(),
    finalizedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_skill_and_state", ["skillId", "state"])
    .index("by_version_and_cluster", ["skillVersionId", "identityClusterId"])
    .index("by_state_and_finalizeAt", ["state", "finalizeAt"]),

  postUseReviewRevisions: defineTable({
    reviewId: v.id("postUseReviews"),
    revisionNumber: v.number(),
    rating: v.number(),
    outcome: v.string(),
    tags: v.array(v.string()),
    text: v.string(),
    evidenceArtifactIds: v.array(v.id("evidenceArtifacts")),
    supersedesRevisionId: v.optional(v.id("postUseReviewRevisions")),
    createdAt: v.number(),
  })
    .index("by_review", ["reviewId"])
    .index("by_review_and_revisionNumber", ["reviewId", "revisionNumber"]),

  postUseReviewResponses: defineTable({
    reviewId: v.id("postUseReviews"),
    authorPrincipalId: v.string(),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_review", ["reviewId"]),

  quarantineEvents: defineTable({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    triggeringReviewId: v.optional(v.id("postUseReviews")),
    triggeringEvaluationId: v.optional(v.id("evaluationEvents")),
    priorState: v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
    nextState: v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
    reason: v.string(),
    publicRedaction: v.string(),
    salesHeld: v.boolean(),
    purchasePayoutsHeld: v.boolean(),
    safeFallbackVersionId: v.optional(v.id("skillVersions")),
    resolvedByPrincipalId: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_skillVersion", ["skillVersionId"])
    .index("by_skill", ["skillId"]),

  skillQualitySnapshots: defineTable({
    skillVersionId: v.id("skillVersions"),
    tag: v.string(),
    score: v.number(),
    adjustedScore: v.number(),
    confidence: v.union(v.literal("provisional"), v.literal("low"), v.literal("medium"), v.literal("high")),
    independentCount: v.number(),
    computedAt: v.number(),
    algorithmVersion: v.number(),
    policyVersion: v.number(),
  }).index("by_skillVersion_and_tag", ["skillVersionId", "tag"]),

  authorReputationSnapshots: defineTable({
    principalId: v.string(),
    tag: v.string(),
    score: v.number(),
    adjustedScore: v.number(),
    confidence: v.union(v.literal("provisional"), v.literal("low"), v.literal("medium"), v.literal("high")),
    independentCount: v.number(),
    computedAt: v.number(),
    algorithmVersion: v.number(),
    policyVersion: v.number(),
  }).index("by_principal_and_tag", ["principalId", "tag"]),

  reviewerTrustSnapshots: defineTable({
    principalId: v.string(),
    tag: v.string(),
    trustBps: v.number(),
    confidence: v.union(v.literal("provisional"), v.literal("low"), v.literal("medium"), v.literal("high")),
    independentCount: v.number(),
    computedAt: v.number(),
    algorithmVersion: v.number(),
    policyVersion: v.number(),
  }).index("by_principal_and_tag", ["principalId", "tag"]),

  installEvents: defineTable({
    principalId: v.string(),
    identityClusterId: v.id("identityClusters"),
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    accessGrantId: v.id("accessGrants"),
    adoptionWeightBps: v.number(),
    redeemedAt: v.number(),
  })
    .index("by_principal_and_skillVersion", ["principalId", "skillVersionId"])
    .index("by_skillVersion", ["skillVersionId"]),

  discoveryProjection: defineTable({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    category: v.string(),
    tags: v.array(v.string()),
    authorHandle: v.string(),
    qualityBps: v.number(),
    adoptionBps: v.number(),
    recencyBps: v.number(),
    totalBps: v.number(),
    confidence: v.union(v.literal("provisional"), v.literal("low"), v.literal("medium"), v.literal("high")),
    independentCount: v.number(),
    quarantineState: v.union(v.literal("clear"), v.literal("held"), v.literal("quarantined")),
    publishedAt: v.number(),
    computedAt: v.number(),
    algorithmVersion: v.number(),
    policyVersion: v.number(),
  })
    .index("by_category_and_totalBps", ["category", "totalBps"])
    .index("by_authorHandle_and_totalBps", ["authorHandle", "totalBps"])
    .index("by_skill", ["skillId"]),

  featureFlags: defineTable({
    key: v.string(),
    mode: v.union(v.literal("off"), v.literal("shadow"), v.literal("cohort"), v.literal("on")),
    cohortIds: v.array(v.string()),
    updatedByPrincipalId: v.optional(v.string()),
    reason: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  migrationProgress: defineTable({
    migrationKey: v.string(),
    version: v.number(),
    cursor: v.optional(v.string()),
    processedCount: v.number(),
    completed: v.boolean(),
    updatedAt: v.number(),
  }).index("by_migrationKey", ["migrationKey"]),

  migrationReviewItems: defineTable({
    findingType: v.union(
      v.literal("synthetic_principal"),
      v.literal("claimed_without_receipt"),
      v.literal("unresolved_dispute"),
      v.literal("post_claim_purchase"),
      v.literal("missing_skill_version"),
    ),
    resourceType: v.string(),
    resourceId: v.string(),
    details: v.string(),
    status: v.union(v.literal("open"), v.literal("resolved"), v.literal("ignored")),
    detectedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_findingType_and_resourceId", ["findingType", "resourceId"])
    .index("by_status", ["status"]),

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
