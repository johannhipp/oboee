import { makeFunctionReference, type WithoutSystemFields } from "convex/server";
import { v } from "convex/values";

import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1_000;
const FIXTURE_NAME = "frontend-complete-v1";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
const NETWORK = "local-tempo";
const SENDER_ADDRESS = "0x3333333333333333333333333333333333333333";

const personaValidator = v.object({
  key: v.string(),
  principalId: v.string(),
  apiKeyId: v.optional(v.string()),
});

type PersonaInput = {
  key: string;
  principalId: string;
  apiKeyId?: string;
};

const seedArgs = {
  fixtureName: v.optional(v.string()),
  reset: v.optional(v.boolean()),
  personas: v.array(personaValidator),
};

const seedMutationArgs = {
  fixtureName: v.string(),
  reset: v.boolean(),
  personas: v.array(personaValidator),
  evidenceStorageIds: v.array(v.id("_storage")),
};

const seedResultValidator = v.object({
  fixtureName: v.string(),
  reset: v.boolean(),
  counts: v.object({
    documents: v.number(),
    storageBlobs: v.number(),
  }),
  personas: v.array(
    v.object({
      key: v.string(),
      principalId: v.string(),
      apiKeyId: v.optional(v.string()),
    }),
  ),
  routes: v.object({
    openRfsId: v.string(),
    publishedRfsId: v.string(),
    skillId: v.string(),
    authorHandle: v.string(),
    reviewId: v.string(),
    moderationReviewId: v.string(),
    assignmentId: v.string(),
    disputeId: v.string(),
    recoveryId: v.string(),
  }),
});

type SeedMutationArgs = {
  fixtureName: string;
  reset: boolean;
  personas: PersonaInput[];
  evidenceStorageIds: Id<"_storage">[];
};

type SeedResult = {
  fixtureName: string;
  reset: boolean;
  counts: { documents: number; storageBlobs: number };
  personas: PersonaInput[];
  routes: {
    openRfsId: string;
    publishedRfsId: string;
    skillId: string;
    authorHandle: string;
    reviewId: string;
    moderationReviewId: string;
    assignmentId: string;
    disputeId: string;
    recoveryId: string;
  };
};

const seedMutationRef = makeFunctionReference<
  "mutation",
  SeedMutationArgs,
  SeedResult
>("devFixtures:seedMutation");

type TrackedTableName = Exclude<TableNames, "devFixtureRecords">;
type TrackedId = {
  [TableName in TrackedTableName]: Id<TableName>;
}[TrackedTableName];
type InsertValue<TableName extends TrackedTableName> = WithoutSystemFields<
  Doc<TableName>
>;

const requireNonproduction = () => {
  if (
    process.env.OBOE_ENVIRONMENT !== "nonproduction" ||
    process.env.OBOE_NONPRODUCTION_BOOTSTRAP_ENABLED !== "true"
  ) {
    throw new Error(
      "Frontend fixtures are disabled. Set OBOE_ENVIRONMENT=nonproduction and OBOE_NONPRODUCTION_BOOTSTRAP_ENABLED=true on the local deployment.",
    );
  }
};

const track = async (
  ctx: MutationCtx,
  fixtureName: string,
  entityId: TrackedId,
  storageId?: Id<"_storage">,
) => {
  await ctx.db.insert("devFixtureRecords", {
    fixtureName,
    entityId,
    storageId,
    createdAt: Date.now(),
  });
};

const insertTracked = async <TableName extends TrackedTableName>(
  ctx: MutationCtx,
  fixtureName: string,
  tableName: TableName,
  value: InsertValue<TableName>,
  storageId?: Id<"_storage">,
): Promise<Id<TableName>> => {
  const entityId = await ctx.db.insert(tableName, value);
  // Convex returns a table-branded ID here. The tracker intentionally stores
  // the union of those IDs so reset can delete any seeded document by ID.
  await track(ctx, fixtureName, entityId as TrackedId, storageId);
  return entityId;
};

const resetFixture = async (ctx: MutationCtx, fixtureName: string) => {
  const records = await ctx.db
    .query("devFixtureRecords")
    .withIndex("by_fixture", (query) => query.eq("fixtureName", fixtureName))
    .collect();
  records.sort((left, right) => right.createdAt - left.createdAt);
  for (const record of records) {
    if (record.storageId) await ctx.storage.delete(record.storageId);
    await ctx.db.delete(record.entityId);
    await ctx.db.delete(record._id);
  }
  return records.length;
};

const personaMap = (personas: PersonaInput[]) =>
  new Map(personas.map((persona) => [persona.key, persona]));

const requirePersona = (personas: Map<string, PersonaInput>, key: string) => {
  const persona = personas.get(key);
  if (!persona?.principalId.trim()) {
    throw new Error(`The frontend fixture requires the ${key} persona.`);
  }
  return persona;
};

const digest = (value: string) => `fixture-${value}-digest`;

export const seedMutation = internalMutation({
  args: seedMutationArgs,
  returns: seedResultValidator,
  handler: async (ctx, args): Promise<SeedResult> => {
    requireNonproduction();
    if (args.evidenceStorageIds.length < 2) {
      throw new Error("The frontend fixture needs two uploaded evidence blobs.");
    }

    const fixtureName = args.fixtureName.trim() || FIXTURE_NAME;
    if (args.reset) await resetFixture(ctx, fixtureName);

    const people = personaMap(args.personas);
    const requester = requirePersona(people, "requester");
    const backer = requirePersona(people, "backer");
    const fulfiller = requirePersona(people, "fulfiller");
    const reviewer = requirePersona(people, "reviewer");
    const adjudicator = requirePersona(people, "adjudicator");
    const operator = requirePersona(people, "operator");
    const consumer = requirePersona(people, "consumer");
    const now = Date.now();
    const future = now + 30 * DAY_MS;
    const past = now - 2 * DAY_MS;

    const profileValues = [
      [requester, "fixture-requester", "Fixture Requester", "Creates realistic requests for frontend coverage."],
      [backer, "fixture-backer", "Fixture Backer", "Funds a request and inspects settlement state."],
      [fulfiller, "fixture-fulfiller", "Fixture Fulfiller", "Publishes a versioned security skill."],
      [reviewer, "fixture-reviewer", "Fixture Reviewer", "Reviews evidence against immutable criteria."],
      [adjudicator, "fixture-adjudicator", "Fixture Adjudicator", "Resolves a disputed evaluation."],
      [operator, "fixture-operator", "Fixture Operator", "Inspects privileged operational queues."],
      [consumer, "fixture-consumer", "Fixture Consumer", "Installs and reviews a published skill."],
    ] as const;
    for (const [persona, handle, displayName, bio] of profileValues) {
      await insertTracked(ctx, fixtureName, "publicProfiles", {
        principalId: persona.principalId,
        handle,
        displayName,
        bio,
        links: [`https://example.test/${handle}`],
        createdAt: past,
        updatedAt: now,
      });
    }

    const clusters = new Map<string, Id<"identityClusters">>();
    for (const [key, persona] of people) {
      const clusterId = await insertTracked(ctx, fixtureName, "identityClusters", {
        status: "active",
        confidenceBps: key === "operator" ? 9_900 : 9_700,
        reasons: key === "operator" ? ["fixture_operator_review"] : ["fixture_verified_principal"],
        manualOverride: false,
        createdAt: past,
        updatedAt: now,
      });
      await insertTracked(ctx, fixtureName, "identityClusterMemberships", {
        clusterId,
        principalId: persona.principalId,
        confidenceBps: key === "operator" ? 9_900 : 9_700,
        reasons: ["fixture_verified_principal"],
        activeFrom: past,
      });
      clusters.set(key, clusterId);
    }

    const walletFor = async (persona: PersonaInput, suffix: string) =>
      await insertTracked(ctx, fixtureName, "principalWallets", {
        principalId: persona.principalId,
        chain: "eip155",
        address: `0x${suffix.repeat(40).slice(0, 40)}`,
        verificationChallenge: `fixture-wallet-challenge-${suffix}`,
        verificationDigest: digest(`wallet-${suffix}`),
        verifiedAt: past,
        primary: true,
        status: "active",
      });
    const requesterWallet = await walletFor(requester, "1");
    const backerWallet = await walletFor(backer, "2");
    const fulfillerWallet = await walletFor(fulfiller, "3");
    const reviewerWallet = await walletFor(reviewer, "4");
    await walletFor(adjudicator, "5");
    await walletFor(operator, "6");
    const consumerWallet = await walletFor(consumer, "7");

    const fixtureVersionId = await insertTracked(ctx, fixtureName, "fixtureVersions", {
      ownerPrincipalId: requester.principalId,
      visibility: "public",
      version: 1,
      manifestSha256: digest("fixture-manifest"),
      bundleSha256: digest("fixture-bundle"),
      environmentContract: JSON.stringify({ runtime: "node", version: "22", command: "npm test" }),
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "fixtureUploadIntents", {
      principalId: requester.principalId,
      visibility: "public",
      manifestSha256: digest("fixture-upload-manifest"),
      bundleSha256: digest("fixture-upload-bundle"),
      environmentContract: "node-22 / npm test",
      maximumBytes: 2_000_000,
      state: "finalized",
      expiresAt: future,
      createdAt: past,
    });

    const roleValues = [
      [reviewer, "trusted_reviewer" as const, ["security"]],
      [adjudicator, "security_adjudicator" as const, ["security"]],
      [operator, "security_operator" as const, []],
      [operator, "platform_operator" as const, []],
    ] as const;
    for (const [persona, role, tags] of roleValues) {
      await insertTracked(ctx, fixtureName, "platformRoles", {
        principalId: persona.principalId,
        role,
        tags: [...tags],
        grantedByPrincipalId: "system:frontend-fixture",
        activeFrom: past,
        activeUntil: future,
        reason: "Local frontend fixture role",
      });
    }

    const cohortIds = [...people.values()].map((persona) => persona.principalId);
    const policyFlag = {
      mode: "cohort" as const,
      cohortIds,
      updatedByPrincipalId: operator.principalId,
      reason: "Local frontend fixture policy cohort",
      updatedAt: now,
    };
    const existingPolicyFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (query) => query.eq("key", "policy_v2"))
      .unique();
    if (existingPolicyFlag) {
      await ctx.db.patch(existingPolicyFlag._id, policyFlag);
    } else {
      await insertTracked(ctx, fixtureName, "featureFlags", {
        key: "policy_v2",
        ...policyFlag,
      });
    }
    await insertTracked(ctx, fixtureName, "featureFlags", {
      key: "fixture_preview",
      mode: "shadow",
      cohortIds,
      updatedByPrincipalId: operator.principalId,
      reason: "Local frontend fixture rollout example",
      updatedAt: now,
    });

    const createRfs = async (args: {
      key: string;
      title: string;
      status: "open" | "funded" | "published";
      currentAmount: bigint;
      authorPrincipalId: string;
      claimantPrincipalId: string;
    }) => {
      const rfsId = await insertTracked(ctx, fixtureName, "rfs", {
        authorUserId: args.authorPrincipalId,
        claimantUserId: args.claimantPrincipalId,
        title: args.title,
        description: `Fixture data for ${args.key}: a realistic policy-v2 request with linked evidence, settlement, and review state.`,
        scope: "Node 22 service and Next.js 16 application boundary",
        tags: ["security", "agents", "frontend-fixture"],
        fundingThresholdBaseUnits: BigInt(1_000_000),
        minimumContributionBaseUnits: BigInt(100_000),
        currentAmountBaseUnits: args.currentAmount,
        fundingTokenAddress: TOKEN_ADDRESS,
        status: args.status,
        policyVersion: 2,
        riskTier: "high",
        workEscrowBaseUnits: BigInt(800_000),
        reviewReserveBaseUnits: BigInt(200_000),
        totalFundingTargetBaseUnits: BigInt(1_000_000),
        fundingDeadline: future,
        applicationDeadline: future,
        deliveryDeadline: future,
        revisionDeadline: future,
        humanReviewRequired: true,
        contractDigest: digest(`rfs-${args.key}`),
        resourceVersion: 1,
        reservedFundingBaseUnits: BigInt(0),
      });
      const revisionId = await insertTracked(ctx, fixtureName, "rfsRevisions", {
        rfsId,
        revisionNumber: 1,
        authorPrincipalId: args.authorPrincipalId,
        title: args.title,
        description: `Committed fixture revision for ${args.key}.`,
        scope: "Node 22 service and Next.js 16 application boundary",
        tags: ["security", "agents", "frontend-fixture"],
        targetEnvironments: ["node-22", "next-16"],
        criteriaDigest: digest(`criteria-${args.key}`),
        fixtureDigest: digest(`fixture-${args.key}`),
        workEscrowBaseUnits: BigInt(800_000),
        reviewReserveBaseUnits: BigInt(200_000),
        totalFundingTargetBaseUnits: BigInt(1_000_000),
        tokenAddress: TOKEN_ADDRESS,
        network: NETWORK,
        fundingDeadline: future,
        deliveryLimitMs: 7 * DAY_MS,
        contractDigest: digest(`revision-${args.key}`),
        policyVersion: 2,
        status: "committed",
        createdAt: past,
      });
      const criteria = await Promise.all([
        insertTracked(ctx, fixtureName, "rfsCriteria", {
          rfsId,
          revisionId,
          criterionKey: "secure-boundary",
          title: "Rejects unauthorized boundary access",
          passConditionKind: "boolean_assertion",
          passCondition: "The protected route returns an authorization error without a valid session.",
          verificationMethod: "Run the route matrix with anonymous and authenticated browser contexts.",
          weightBps: 6_000,
          requiredForPublication: true,
          tags: ["security"],
          createdAt: past,
        }),
        insertTracked(ctx, fixtureName, "rfsCriteria", {
          rfsId,
          revisionId,
          criterionKey: "fixture-regression",
          title: "Shows representative fixture data",
          passConditionKind: "fixture_assertion",
          passCondition: "The seeded frontend route matrix renders linked public and private records.",
          verificationMethod: "Inspect the seeded public catalog, workspaces, review queues, and operations queues.",
          weightBps: 4_000,
          requiredForPublication: false,
          tags: ["frontend-fixture"],
          fixtureVersionId,
          createdAt: past,
        }),
      ]);
      await ctx.db.patch(rfsId, { currentRevisionId: revisionId });
      return { rfsId, revisionId, criteria };
    };

    const openRfs = await createRfs({
      key: "open",
      title: "Fixture request: secure agent handoff",
      status: "open",
      currentAmount: BigInt(300_000),
      authorPrincipalId: requester.principalId,
      claimantPrincipalId: fulfiller.principalId,
    });
    const fundedRfs = await createRfs({
      key: "funded",
      title: "Fixture request: reproducible evidence scanner",
      status: "funded",
      currentAmount: BigInt(1_000_000),
      authorPrincipalId: requester.principalId,
      claimantPrincipalId: fulfiller.principalId,
    });
    const publishedRfs = await createRfs({
      key: "published",
      title: "Fixture request: publish a safe security skill",
      status: "published",
      currentAmount: BigInt(1_000_000),
      authorPrincipalId: requester.principalId,
      claimantPrincipalId: fulfiller.principalId,
    });

    const skillId = await insertTracked(ctx, fixtureName, "skills", {
      rfsId: publishedRfs.rfsId,
      authorUserId: fulfiller.principalId,
      contentMarkdown: "# Fixture security skill\n\nA safe, deterministic skill used by local frontend coverage.",
      summary: "A seeded security skill with public quality and review evidence.",
      tags: ["security", "agents", "frontend-fixture"],
      purchasePriceBaseUnits: BigInt(25_000),
      latestVersion: 1,
      latestContentHash: digest("skill-v1"),
      status: "published",
      policyVersion: 2,
      quarantineState: "clear",
    });
    const skillVersionId = await insertTracked(ctx, fixtureName, "skillVersions", {
      skillId,
      rfsId: publishedRfs.rfsId,
      version: 1,
      contentHash: digest("skill-v1"),
      contentMarkdown: "# Fixture security skill\n\nThis is safe sample content for local testing.",
      summary: "A seeded security skill with public quality and review evidence.",
      tags: ["security", "agents", "frontend-fixture"],
      purchasePriceBaseUnits: BigInt(25_000),
      authorUserId: fulfiller.principalId,
      status: "published",
      submittedAt: past,
      evaluationDeadline: future,
      acceptedAt: past,
      publishedAt: past,
      policyVersion: 2,
      digestAlgorithm: "sha256",
      quarantineState: "clear",
      legacyImported: false,
    });
    await ctx.db.patch(skillId, { publishedVersionId: skillVersionId, safeFallbackVersionId: skillVersionId });
    await ctx.db.patch(publishedRfs.rfsId, { currentRevisionId: publishedRfs.revisionId });
    await insertTracked(ctx, fixtureName, "skillQualitySnapshots", {
      skillVersionId,
      tag: "general",
      score: 4.6,
      adjustedScore: 4.5,
      confidence: "high",
      independentCount: 8,
      computedAt: now,
      algorithmVersion: 2,
      policyVersion: 2,
    });
    await insertTracked(ctx, fixtureName, "discoveryProjection", {
      skillId,
      skillVersionId,
      category: "security",
      tags: ["security", "agents", "frontend-fixture"],
      authorHandle: "fixture-fulfiller",
      qualityBps: 9_000,
      adoptionBps: 7_500,
      recencyBps: 9_800,
      totalBps: 8_900,
      confidence: "high",
      independentCount: 8,
      quarantineState: "clear",
      publishedAt: past,
      computedAt: now,
      algorithmVersion: 2,
      policyVersion: 2,
    });

    const fulfillerApplicationId = await insertTracked(ctx, fixtureName, "rfsApplications", {
      rfsId: fundedRfs.rfsId,
      principalId: fulfiller.principalId,
      identityClusterId: clusters.get("fulfiller")!,
      payoutWalletId: fulfillerWallet,
      etaMs: 2 * DAY_MS,
      bondAcknowledged: true,
      state: "selected",
      scoreSnapshotJson: JSON.stringify({ quality: 9_000, delivery: 9_500 }),
      qualityScoreBps: 9_000,
      deliveryScoreBps: 9_500,
      verificationScoreBps: 9_200,
      endorsementScoreBps: 8_500,
      etaScoreBps: 9_800,
      riskPenaltyBps: 0,
      totalScoreBps: 9_300,
      rank: 1,
      tieBreakJson: JSON.stringify({ selectedBy: "fixture" }),
      bondRequired: true,
      policyVersion: 2,
      resourceVersion: 1,
      submittedAt: past,
    });
    const backerApplicationId = await insertTracked(ctx, fixtureName, "rfsApplications", {
      rfsId: fundedRfs.rfsId,
      principalId: backer.principalId,
      identityClusterId: clusters.get("backer")!,
      payoutWalletId: backerWallet,
      etaMs: 4 * DAY_MS,
      bondAcknowledged: true,
      state: "waitlisted",
      scoreSnapshotJson: JSON.stringify({ quality: 7_500, delivery: 7_000 }),
      qualityScoreBps: 7_500,
      deliveryScoreBps: 7_000,
      verificationScoreBps: 7_800,
      endorsementScoreBps: 6_500,
      etaScoreBps: 7_000,
      riskPenaltyBps: 500,
      totalScoreBps: 7_100,
      rank: 2,
      tieBreakJson: JSON.stringify({ selectedBy: "fixture" }),
      bondRequired: true,
      policyVersion: 2,
      resourceVersion: 1,
      submittedAt: past,
    });
    const fulfillerApplicationRevisionId = await insertTracked(ctx, fixtureName, "applicationRevisions", {
      applicationId: fulfillerApplicationId,
      revisionNumber: 1,
      principalId: fulfiller.principalId,
      etaMs: 2 * DAY_MS,
      environment: "node-22 / next-16",
      criterionPlansJson: JSON.stringify({ "secure-boundary": "route matrix" }),
      evidenceMethod: "Signed fixture output and browser route assertions.",
      relevantWorkReferences: [String(publishedRfs.rfsId)],
      bondAcknowledged: true,
      payloadDigest: digest("application-fulfiller"),
      resourceVersion: 1,
      withdrawn: false,
      createdAt: past,
    });
    const backerApplicationRevisionId = await insertTracked(ctx, fixtureName, "applicationRevisions", {
      applicationId: backerApplicationId,
      revisionNumber: 1,
      principalId: backer.principalId,
      etaMs: 4 * DAY_MS,
      environment: "node-22 / next-16",
      criterionPlansJson: JSON.stringify({ "fixture-regression": "seeded samples" }),
      evidenceMethod: "Public fixture inspection.",
      relevantWorkReferences: [String(openRfs.rfsId)],
      bondAcknowledged: true,
      payloadDigest: digest("application-backer"),
      resourceVersion: 1,
      withdrawn: false,
      createdAt: past,
    });
    await ctx.db.patch(fulfillerApplicationId, { currentRevisionId: fulfillerApplicationRevisionId });
    await ctx.db.patch(backerApplicationId, { currentRevisionId: backerApplicationRevisionId });
    await ctx.db.patch(fundedRfs.rfsId, { selectedApplicationId: fulfillerApplicationId });
    await insertTracked(ctx, fixtureName, "applicationEndorsements", {
      rfsId: fundedRfs.rfsId,
      applicationId: fulfillerApplicationId,
      principalId: requester.principalId,
      identityClusterId: clusters.get("requester")!,
      role: "requester",
      contributionShareNumerator: BigInt(1),
      contributionShareDenominator: BigInt(1),
      active: true,
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "contributions", {
      rfsId: fundedRfs.rfsId,
      backerUserId: backer.principalId,
      amountBaseUnits: BigInt(1_000_000),
      currencyAddress: TOKEN_ADDRESS,
      challengeId: "fixture-funding-challenge",
      receiptReference: "fixture-funding-receipt",
      status: "accepted",
      policyVersion: 2,
      payerWalletId: backerWallet,
      appliedAmountBaseUnits: BigInt(1_000_000),
      refundAmountBaseUnits: BigInt(0),
    });

    const paymentIntentId = await insertTracked(ctx, fixtureName, "paymentIntents", {
      resourceType: "rfs_funding",
      resourceId: String(fundedRfs.rfsId),
      principalId: backer.principalId,
      walletId: backerWallet,
      payerAddressSnapshot: "0x2222222222222222222222222222222222222222",
      tokenAddress: TOKEN_ADDRESS,
      network: NETWORK,
      amountBaseUnits: BigInt(1_000_000),
      contractDigest: digest("funding-contract"),
      challengeId: "fixture-payment-challenge",
      challengeEnvelope: "fixture-payment-envelope",
      receiptReference: "fixture-payment-receipt",
      state: "confirmed",
      idempotencyKey: "fixture-payment-intent",
      policyVersion: 2,
      expiresAt: future,
      createdAt: past,
      confirmedAt: past,
      resultResourceType: "rfs",
      resultResourceId: String(fundedRfs.rfsId),
    });
    await insertTracked(ctx, fixtureName, "bondEscrows", {
      rfsId: fundedRfs.rfsId,
      applicationId: fulfillerApplicationId,
      principalId: fulfiller.principalId,
      amountBaseUnits: BigInt(50_000),
      paymentIntentId,
      state: "funded",
      createdAt: past,
    });

    const assessmentId = await insertTracked(ctx, fixtureName, "payoutAssessments", {
      rfsId: publishedRfs.rfsId,
      skillId,
      skillVersionId,
      skillVersion: 1,
      authorUserId: fulfiller.principalId,
      grossAmountBaseUnits: BigInt(800_000),
      basePayoutBaseUnits: BigInt(800_000),
      qualityMultiplierBps: 8_500,
      finalPayoutBaseUnits: BigInt(680_000),
      platformFeeBaseUnits: BigInt(120_000),
      unreleasedAmountBaseUnits: BigInt(0),
      status: "reduced",
      assessmentReason: "Fixture assessment awaiting independent review.",
      evaluationWindowOpenedAt: past,
      evaluationWindowClosedAt: future,
      policyVersion: 2,
      workflowStatus: "human_review",
      decisionKind: "partial",
      passedWeightBps: 8_500,
      grossAuthorBaseUnits: BigInt(800_000),
      netAuthorBaseUnits: BigInt(680_000),
      refundPoolBaseUnits: BigInt(0),
      resourceVersion: 1,
    });

    const publicEvidenceStorageId = args.evidenceStorageIds[0];
    const restrictedEvidenceStorageId = args.evidenceStorageIds[1];
    const publicArtifactId = await insertTracked(
      ctx,
      fixtureName,
      "evidenceArtifacts",
      {
        ownerPrincipalId: fulfiller.principalId,
        rfsId: publishedRfs.rfsId,
        skillVersionId,
        criterionId: publishedRfs.criteria[0],
        evaluationId: undefined,
        classification: "public",
        verificationState: "verified",
        scanState: "clean",
        scanReportReference: "fixture-scan-public",
        plaintextSha256: digest("public-evidence-plaintext"),
        ciphertextSha256: digest("public-evidence-ciphertext"),
        ciphertextStorageId: publicEvidenceStorageId,
        wrappedDataKey: "fixture-wrapped-key-public",
        nonce: "fixture-nonce-public",
        authenticationTag: "fixture-auth-tag-public",
        kmsKeyVersion: "fixture-kms-v1",
        mimeType: "text/plain",
        sizeBytes: 256,
        publicRedaction: "Browser route matrix passed with anonymous and authenticated contexts.",
        proofManifest: JSON.stringify({ fixture: FIXTURE_NAME, state: "verified" }),
        proofSignature: "fixture-signature-public",
        verifiedByPrincipalId: reviewer.principalId,
        verifiedAt: past,
        retentionDeleteAt: future,
        legalHold: false,
        createdAt: past,
      },
      publicEvidenceStorageId,
    );
    const restrictedArtifactId = await insertTracked(
      ctx,
      fixtureName,
      "evidenceArtifacts",
      {
        ownerPrincipalId: fulfiller.principalId,
        rfsId: publishedRfs.rfsId,
        skillVersionId,
        criterionId: publishedRfs.criteria[1],
        evaluationId: undefined,
        classification: "restricted",
        restrictionReason: "private_source",
        verificationState: "submitted",
        scanState: "pending",
        scanReason: "Awaiting fixture scanner pass.",
        plaintextSha256: digest("restricted-evidence-plaintext"),
        ciphertextSha256: digest("restricted-evidence-ciphertext"),
        ciphertextStorageId: restrictedEvidenceStorageId,
        wrappedDataKey: "fixture-wrapped-key-restricted",
        nonce: "fixture-nonce-restricted",
        authenticationTag: "fixture-auth-tag-restricted",
        kmsKeyVersion: "fixture-kms-v1",
        mimeType: "application/json",
        sizeBytes: 512,
        publicRedaction: "Restricted scanner input retained under a legal hold.",
        retentionDeleteAt: future,
        legalHold: true,
        createdAt: past,
      },
      restrictedEvidenceStorageId,
    );
    await insertTracked(ctx, fixtureName, "evidenceAccessEvents", {
      artifactId: publicArtifactId,
      actorPrincipalId: reviewer.principalId,
      action: "read",
      reason: "Fixture reviewer inspection",
      result: "allowed",
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "evidenceAccessEvents", {
      artifactId: restrictedArtifactId,
      actorPrincipalId: operator.principalId,
      action: "legal_hold",
      reason: "Fixture retention test",
      result: "completed",
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "artifactUploadIntents", {
      principalId: fulfiller.principalId,
      rfsId: publishedRfs.rfsId,
      skillVersionId,
      criterionId: publishedRfs.criteria[1],
      expectedMimeType: "application/json",
      maximumBytes: 2_000_000,
      state: "uploaded",
      expiresAt: future,
      createdAt: past,
    });

    const evaluationId = await insertTracked(ctx, fixtureName, "evaluationEvents", {
      skillId,
      skillVersionId,
      skillVersion: 1,
      contentHash: digest("skill-v1"),
      rfsId: publishedRfs.rfsId,
      reviewerIdentityId: reviewer.principalId,
      reviewerType: "human",
      agentRuntime: undefined,
      targetEnvironment: "node-22 / next-16",
      vulnerabilityTags: ["security"],
      rating: 4,
      outcome: "improved",
      confidence: "high",
      evidenceType: "human_review",
      evidenceSummary: "Seeded independent reviewer confirms the published sample.",
      evidenceReferences: [String(publicArtifactId)],
      reviewText: "Fixture review: evidence is linked to the exact skill version.",
      weightBps: 8_500,
      payoutImpact: "positive",
      createdAt: past,
      policyVersion: 2,
      phase: "post_publish",
      principalId: reviewer.principalId,
      identityClusterId: clusters.get("reviewer"),
      relevantTagTrustBps: 9_000,
      active: true,
    });
    await ctx.db.patch(publicArtifactId, { evaluationId });
    await ctx.db.patch(restrictedArtifactId, { evaluationId });
    await insertTracked(ctx, fixtureName, "evaluationCriterionResults", {
      evaluationId,
      criterionId: publishedRfs.criteria[0],
      result: "passed",
      artifactIds: [publicArtifactId],
      verifierState: "verified",
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "evaluationCriterionResults", {
      evaluationId,
      criterionId: publishedRfs.criteria[1],
      result: "passed",
      artifactIds: [restrictedArtifactId],
      verifierState: "submitted",
      createdAt: past,
    });

    const assignmentId = await insertTracked(ctx, fixtureName, "reviewAssignments", {
      rfsId: publishedRfs.rfsId,
      assessmentId,
      reviewerPrincipalId: reviewer.principalId,
      reason: "insufficient_evidence",
      tags: ["security"],
      dueAt: future,
      reserveFeeBaseUnits: BigInt(25_000),
      state: "accepted",
      acceptedAt: past,
      createdAt: past,
    });
    const disputeId = await insertTracked(ctx, fixtureName, "disputes", {
      rfsId: publishedRfs.rfsId,
      assessmentId,
      triggerType: "harmful_hold",
      triggeringEvaluationId: evaluationId,
      openedByPrincipalId: reviewer.principalId,
      assignedPrincipalId: adjudicator.principalId,
      state: "assigned",
      stickyHold: true,
      dueAt: future,
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "disputeEvents", {
      disputeId,
      actorPrincipalId: reviewer.principalId,
      eventType: "opened",
      nextState: "open",
      evidenceArtifactIds: [publicArtifactId, restrictedArtifactId],
      rationale: "Fixture harmful hold requires independent adjudication.",
      publicRedaction: "The fixture includes evidence for a held review.",
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "disputeEvents", {
      disputeId,
      actorPrincipalId: adjudicator.principalId,
      eventType: "assigned",
      priorState: "open",
      nextState: "assigned",
      evidenceArtifactIds: [],
      rationale: "Fixture adjudicator assigned.",
      occurredAt: past,
    });

    const purchaseId = await insertTracked(ctx, fixtureName, "purchases", {
      skillId,
      buyerUserId: consumer.principalId,
      amountBaseUnits: BigInt(25_000),
      currencyAddress: TOKEN_ADDRESS,
      challengeId: "fixture-purchase-challenge",
      receiptReference: "fixture-purchase-receipt",
      skillVersionId,
      buyerWalletId: consumerWallet,
      status: "confirmed",
    });
    const accessGrantId = await insertTracked(ctx, fixtureName, "accessGrants", {
      userId: consumer.principalId,
      principalId: consumer.principalId,
      skillId,
      source: "purchase",
      skillVersionId,
      active: true,
      redeemedAt: past,
    });
    const publicReviewId = await insertTracked(ctx, fixtureName, "postUseReviews", {
      skillId,
      skillVersionId,
      accessGrantId,
      reviewerPrincipalId: consumer.principalId,
      identityClusterId: clusters.get("consumer")!,
      rating: 5,
      outcome: "improved",
      tags: ["security", "agents"],
      text: "The fixture skill made the boundary behavior easy to verify.",
      state: "finalized",
      finalizeAt: past,
      finalizedAt: past,
      createdAt: past,
    });
    const publicReviewRevisionId = await insertTracked(ctx, fixtureName, "postUseReviewRevisions", {
      reviewId: publicReviewId,
      revisionNumber: 1,
      rating: 5,
      outcome: "improved",
      tags: ["security", "agents"],
      text: "The fixture skill made the boundary behavior easy to verify.",
      evidenceArtifactIds: [publicArtifactId],
      createdAt: past,
    });
    await ctx.db.patch(publicReviewId, { currentRevisionId: publicReviewRevisionId });
    await insertTracked(ctx, fixtureName, "postUseReviewResponses", {
      reviewId: publicReviewId,
      authorPrincipalId: fulfiller.principalId,
      text: "Thanks for the reproducible report. The exact version remains linked.",
      createdAt: now,
    });
    const moderationReviewId = await insertTracked(ctx, fixtureName, "postUseReviews", {
      skillId,
      skillVersionId,
      accessGrantId,
      reviewerPrincipalId: consumer.principalId,
      identityClusterId: clusters.get("consumer")!,
      rating: 2,
      outcome: "harmful",
      tags: ["security"],
      text: "Fixture moderation sample: this review awaits an adjudicator decision.",
      state: "moderation",
      finalizeAt: future,
      createdAt: past,
    });
    const moderationRevisionId = await insertTracked(ctx, fixtureName, "postUseReviewRevisions", {
      reviewId: moderationReviewId,
      revisionNumber: 1,
      rating: 2,
      outcome: "harmful",
      tags: ["security"],
      text: "Fixture moderation sample: this review awaits an adjudicator decision.",
      evidenceArtifactIds: [restrictedArtifactId],
      createdAt: past,
    });
    await ctx.db.patch(moderationReviewId, { currentRevisionId: moderationRevisionId });
    await ctx.db.patch(evaluationId, { publicReviewId });
    await insertTracked(ctx, fixtureName, "installEvents", {
      principalId: consumer.principalId,
      identityClusterId: clusters.get("consumer")!,
      skillId,
      skillVersionId,
      accessGrantId,
      adoptionWeightBps: 8_000,
      redeemedAt: past,
    });
    await insertTracked(ctx, fixtureName, "purchasePayoutBatches", {
      skillId,
      authorPrincipalId: fulfiller.principalId,
      fromPurchaseCreationTime: past,
      throughPurchaseCreationTime: now,
      grossBaseUnits: BigInt(25_000),
      platformFeeBaseUnits: BigInt(2_500),
      netBaseUnits: BigInt(22_500),
      state: "obligated",
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "reputationEvents", {
      subjectType: "author_tag",
      subjectId: fulfiller.principalId,
      tag: "security",
      sourceType: "post_use_review",
      sourceId: String(publicReviewId),
      finalDecisionId: String(publicReviewId),
      score: 4.8,
      signalStrength: 0.9,
      identityClusterId: clusters.get("consumer")!,
      occurredAt: past,
      policyVersion: 2,
    });
    await insertTracked(ctx, fixtureName, "authorReputationSnapshots", {
      principalId: fulfiller.principalId,
      tag: "security",
      score: 4.7,
      adjustedScore: 4.6,
      confidence: "high",
      independentCount: 8,
      computedAt: now,
      algorithmVersion: 2,
      policyVersion: 2,
    });
    await insertTracked(ctx, fixtureName, "reviewerTrustSnapshots", {
      principalId: reviewer.principalId,
      tag: "security",
      trustBps: 9_200,
      confidence: "high",
      independentCount: 12,
      computedAt: now,
      algorithmVersion: 2,
      policyVersion: 2,
    });
    await insertTracked(ctx, fixtureName, "authorReputations", {
      authorUserId: fulfiller.principalId,
      tag: "security",
      qualityScore: 0.92,
      deliveryReliabilityScore: 0.95,
      revisionRate: 0.1,
      disputeRate: 0.02,
      acceptedSkillCount: 4,
      rejectedSkillCount: 0,
      weightedInstallCount: 8,
      weightedOutcomeScore: 0.9,
      confidence: "high",
      lastUpdatedAt: now,
    });
    await insertTracked(ctx, fixtureName, "reviewerReputations", {
      reviewerIdentityId: reviewer.principalId,
      globalTrustScore: 0.92,
      tagTrustScores: [{ tag: "security", trustScore: 0.92 }],
      verifiedEvaluationsCount: 12,
      disputedEvaluationsCount: 1,
      sybilRiskScore: 0.03,
      lastActiveAt: now,
    });

    const authorObligationId = await insertTracked(ctx, fixtureName, "settlementObligations", {
      sourceType: "purchase_batch",
      sourceId: String(purchaseId),
      beneficiaryPrincipalId: fulfiller.principalId,
      kind: "purchase_earning",
      amountBaseUnits: BigInt(22_500),
      walletId: fulfillerWallet,
      recipientAddressSnapshot: "0x3333333333333333333333333333333333333333",
      tokenAddress: TOKEN_ADDRESS,
      network: NETWORK,
      decisionReference: "fixture-purchase-payout",
      policyVersion: 2,
      state: "pending",
      createdAt: now,
    });
    const reviewerObligationId = await insertTracked(ctx, fixtureName, "settlementObligations", {
      sourceType: "review_reserve",
      sourceId: String(assessmentId),
      beneficiaryPrincipalId: reviewer.principalId,
      kind: "reviewer_fee",
      amountBaseUnits: BigInt(25_000),
      walletId: reviewerWallet,
      recipientAddressSnapshot: "0x4444444444444444444444444444444444444444",
      tokenAddress: TOKEN_ADDRESS,
      network: NETWORK,
      decisionReference: "fixture-review-reserve",
      policyVersion: 2,
      state: "held",
      createdAt: now,
    });
    const requesterObligationId = await insertTracked(ctx, fixtureName, "settlementObligations", {
      sourceType: "rfs_work",
      sourceId: String(openRfs.rfsId),
      beneficiaryPrincipalId: requester.principalId,
      kind: "backer_refund",
      amountBaseUnits: BigInt(100_000),
      walletId: requesterWallet,
      recipientAddressSnapshot: "0x1111111111111111111111111111111111111111",
      tokenAddress: TOKEN_ADDRESS,
      network: NETWORK,
      decisionReference: "fixture-open-request-refund-preview",
      policyVersion: 2,
      state: "queued",
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "settlementTransfers", {
      obligationId: authorObligationId,
      batchId: "fixture-batch-1",
      idempotencyKey: "fixture-transfer-author",
      network: NETWORK,
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      recipientAddress: "0x3333333333333333333333333333333333333333",
      amountBaseUnits: BigInt(22_500),
      state: "failed",
      attempts: 2,
      errorCode: "fixture_custody_retry",
      nextAttemptAt: future,
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "settlementTransfers", {
      obligationId: reviewerObligationId,
      batchId: "fixture-batch-1",
      idempotencyKey: "fixture-transfer-reviewer",
      network: NETWORK,
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      recipientAddress: "0x4444444444444444444444444444444444444444",
      amountBaseUnits: BigInt(25_000),
      state: "confirmed",
      transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      verifiedReceiptJson: JSON.stringify({ confirmations: 4, success: true }),
      attempts: 1,
      createdAt: past,
      confirmedAt: past,
    });
    await insertTracked(ctx, fixtureName, "settlementTransfers", {
      obligationId: requesterObligationId,
      batchId: "fixture-batch-2",
      idempotencyKey: "fixture-transfer-requester",
      network: NETWORK,
      tokenAddress: TOKEN_ADDRESS,
      senderAddress: SENDER_ADDRESS,
      recipientAddress: "0x1111111111111111111111111111111111111111",
      amountBaseUnits: BigInt(100_000),
      state: "broadcast",
      custodyNonce: "fixture-custody-nonce",
      attempts: 1,
      nextAttemptAt: future,
      createdAt: past,
    });

    await insertTracked(ctx, fixtureName, "humanActionRequests", {
      ownerPrincipalId: requester.principalId,
      actionType: "confirm_high_value_assignment",
      resourceType: "rfs",
      resourceId: String(fundedRfs.rfsId),
      payloadDigest: digest("human-action-requester"),
      requestedBoundsJson: JSON.stringify({ amountBaseUnits: "800000", scope: "security" }),
      reason: "Confirm the selected fulfiller for a high-value fixture request.",
      status: "pending",
      expiresAt: future,
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "humanActionRequests", {
      ownerPrincipalId: operator.principalId,
      actionType: "place_legal_hold",
      resourceType: "evidenceArtifact",
      resourceId: String(restrictedArtifactId),
      payloadDigest: digest("human-action-operator"),
      requestedBoundsJson: JSON.stringify({ legalHold: true }),
      reason: "Fixture restricted evidence requires a retention decision.",
      status: "pending",
      expiresAt: future,
      createdAt: past,
    });

    const recoveryId = await insertTracked(ctx, fixtureName, "accountRecoveryRequests", {
      principalId: consumer.principalId,
      priorWalletId: consumerWallet,
      walletProofDigest: digest("recovery-proof"),
      status: "pending_approvals",
      coolingOffUntil: future,
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "accountRecoveryChallenges", {
      principalId: consumer.principalId,
      walletId: consumerWallet,
      challenge: "fixture-recovery-challenge",
      challengeDigest: digest("recovery-challenge"),
      state: "pending",
      expiresAt: future,
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "identityRiskSignals", {
      principalId: consumer.principalId,
      signalType: "payment_wallet",
      valueHmac: digest("consumer-wallet-risk"),
      confidenceBps: 3_500,
      provenance: "fixture-payment-provider",
      observedFrom: past,
      observedUntil: future,
      expiresAt: future,
    });
    await insertTracked(ctx, fixtureName, "identityClusterEvents", {
      actorPrincipalId: operator.principalId,
      eventType: "override_expired",
      sourceClusterIds: [clusters.get("consumer")!],
      resultingClusterIds: [clusters.get("consumer")!],
      affectedPrincipalIds: [consumer.principalId],
      reason: "Fixture historical identity event.",
      occurredAt: past,
    });

    const activityByPersona = [
      [requester, "requester", String(openRfs.rfsId), "request.created", "Created a seeded open request."],
      [requester, "requester", String(fundedRfs.rfsId), "request.funded", "A seeded request reached its funding target."],
      [fulfiller, "fulfiller", String(skillId), "skill.published", "Published the seeded security skill."],
      [reviewer, "reviewer", String(assignmentId), "review.accepted", "Accepted the seeded review assignment."],
      [operator, "operator", String(recoveryId), "recovery.queued", "A seeded account recovery awaits approvals."],
    ] as const;
    for (const [sequence, [persona, role, resourceId, eventType, publicSummary]] of activityByPersona.entries()) {
      await insertTracked(ctx, fixtureName, "activityEvents", {
        principalId: persona.principalId,
        role,
        resourceType: "fixture",
        resourceId,
        eventType,
        publicSummary,
        capabilityReference: `fixture:${eventType}`,
        sequence: sequence + 1,
        occurredAt: past,
      });
    }
    await insertTracked(ctx, fixtureName, "apiOperations", {
      principalId: operator.principalId,
      command: "reconcile_fixture_queue",
      resourceType: "fixture",
      resourceId: FIXTURE_NAME,
      status: "running",
      progressBps: 6_500,
      cancellable: true,
      nextPollAt: future,
      eventSequence: 1,
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "apiRateLimits", {
      principalId: requester.principalId,
      action: "create_rfs",
      windowStartedAt: now - 10_000,
      count: 2,
      expiresAt: future,
    });
    await insertTracked(ctx, fixtureName, "idempotencyRecords", {
      principalId: requester.principalId,
      apiVersion: "v2",
      action: "create_rfs",
      idempotencyKey: "fixture-idempotency-rfs",
      requestDigest: digest("idempotency-rfs"),
      resultResourceType: "rfs",
      resultResourceId: String(openRfs.rfsId),
      state: "completed",
      resultJson: JSON.stringify({ rfsId: String(openRfs.rfsId) }),
      expiresAt: future,
      createdAt: past,
    });

    await insertTracked(ctx, fixtureName, "migrationProgress", {
      migrationKey: "policy-v2-fixture",
      version: 2,
      cursor: String(publishedRfs.rfsId),
      processedCount: 42,
      completed: false,
      updatedAt: now,
    });
    const migrationFindingId = await insertTracked(ctx, fixtureName, "migrationReviewItems", {
      findingType: "missing_skill_version",
      resourceType: "skill",
      resourceId: String(skillId),
      details: "Fixture finding: an old record is awaiting version backfill review.",
      status: "open",
      detectedAt: past,
    });
    await insertTracked(ctx, fixtureName, "policyShadowComparisons", {
      rfsId: fundedRfs.rfsId,
      legacyFirstApplicationId: backerApplicationId,
      policyV2ApplicationId: fulfillerApplicationId,
      diverged: true,
      legacySubmittedAt: past,
      policyV2ScoreBps: 9_300,
      comparedAt: now,
      algorithmVersion: 2,
    });
    await insertTracked(ctx, fixtureName, "operatorAuditEvents", {
      actorPrincipalId: operator.principalId,
      action: "fixture.seed",
      targetType: "devFixture",
      targetId: fixtureName,
      reason: "Seeded complete frontend fixture graph.",
      requestDigest: digest("fixture-seed"),
      result: "completed",
      metadataJson: JSON.stringify({ migrationFindingId: String(migrationFindingId), evidenceArtifactIds: [String(publicArtifactId), String(restrictedArtifactId)] }),
      occurredAt: now,
    });
    await insertTracked(ctx, fixtureName, "operatorAuditEvents", {
      actorPrincipalId: "system:frontend-fixture",
      action: "fixture.roles",
      targetType: "platformRole",
      targetId: String(operator.principalId),
      reason: "Granted local fixture personas their route-gating roles.",
      requestDigest: digest("fixture-roles"),
      result: "completed",
      metadataJson: JSON.stringify({ roles: roleValues.map(([, role]) => role) }),
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "paymentEvents", {
      type: "fund",
      resourceId: String(fundedRfs.rfsId),
      challengeId: "fixture-funding-challenge",
      receiptReference: "fixture-funding-receipt",
      amountBaseUnits: BigInt(1_000_000),
      currencyAddress: TOKEN_ADDRESS,
      status: "confirmed",
    });
    await insertTracked(ctx, fixtureName, "bondEvents", {
      bondEscrowId: (await ctx.db.query("bondEscrows").withIndex("by_rfs", (query) => query.eq("rfsId", fundedRfs.rfsId)).first())!._id,
      actorPrincipalId: fulfiller.principalId,
      priorState: "required",
      nextState: "funded",
      reason: "Fixture bond receipt confirmed.",
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "payoutLedger", {
      rfsId: publishedRfs.rfsId,
      researcherUserId: fulfiller.principalId,
      grossAmountBaseUnits: BigInt(800_000),
      platformFeeBaseUnits: BigInt(120_000),
      netAmountBaseUnits: BigInt(680_000),
      status: "claimable",
      receiptReference: "fixture-payout-ledger",
    });
    await insertTracked(ctx, fixtureName, "payoutEntries", {
      rfsId: publishedRfs.rfsId,
      researcherUserId: fulfiller.principalId,
      source: "purchase",
      grossAmountBaseUnits: BigInt(25_000),
      platformFeeBaseUnits: BigInt(2_500),
      netAmountBaseUnits: BigInt(22_500),
      status: "claimable",
      claimGroupId: "fixture-payout-group",
    });
    await insertTracked(ctx, fixtureName, "quarantineEvents", {
      skillId,
      skillVersionId,
      triggeringReviewId: moderationReviewId,
      priorState: "held",
      nextState: "clear",
      reason: "Fixture historical quarantine resolution.",
      publicRedaction: "Fixture review was resolved for the seeded public version.",
      salesHeld: false,
      purchasePayoutsHeld: false,
      safeFallbackVersionId: skillVersionId,
      resolvedByPrincipalId: operator.principalId,
      occurredAt: past,
    });
    await insertTracked(ctx, fixtureName, "walletVerificationChallenges", {
      principalId: operator.principalId,
      chain: "eip155",
      chainId: 4_217,
      address: "0x6666666666666666666666666666666666666666",
      nonce: "fixture-expired-wallet",
      domain: "localhost:3100",
      uri: "http://localhost:3100",
      message: "Expired fixture wallet challenge",
      messageDigest: digest("expired-wallet"),
      state: "expired",
      expiresAt: past,
      createdAt: past - DAY_MS,
    });
    await insertTracked(ctx, fixtureName, "principalSigningKeys", {
      principalId: fulfiller.principalId,
      publicKey: "fixture-ed25519-public-key",
      algorithm: "ed25519",
      purpose: "proof_manifest",
      verifiedAt: past,
      activeFrom: past,
      activeUntil: future,
    });
    await insertTracked(ctx, fixtureName, "proofKeyChallenges", {
      principalId: fulfiller.principalId,
      publicKey: "fixture-ed25519-public-key",
      algorithm: "ed25519",
      purpose: "proof_manifest",
      challenge: "fixture-proof-key-challenge",
      challengeDigest: digest("proof-key-challenge"),
      state: "pending",
      expiresAt: future,
      createdAt: now,
    });
    await insertTracked(ctx, fixtureName, "apiKeyAuthorizations", {
      principalId: requester.principalId,
      apiKeyId: requester.apiKeyId ?? "fixture-api-key-requester",
      permissions: ["rfs:read", "apply", "submit", "evaluate"],
      authorizationDigest: digest("requester-api-key"),
      issuedAt: past,
      createdAt: past,
    });
    await insertTracked(ctx, fixtureName, "agentDelegations", {
      principalId: requester.principalId,
      apiKeyId: requester.apiKeyId ?? "fixture-api-key-requester",
      name: "fixture bounded reviewer",
      permissions: ["rfs:read", "apply", "submit", "evaluate"],
      actions: ["rfs:read", "apply", "submit", "evaluate"],
      resourceAllowlist: [String(publishedRfs.rfsId)],
      tagAllowlist: ["security"],
      perTransactionCapBaseUnits: BigInt(100_000),
      rolling24HourCapBaseUnits: BigInt(500_000),
      lifetimeCapBaseUnits: BigInt(2_000_000),
      reservedBaseUnits: BigInt(0),
      consumedRollingBaseUnits: BigInt(0),
      consumedLifetimeBaseUnits: BigInt(0),
      rollingWindowStartedAt: now,
      tokenAddress: TOKEN_ADDRESS,
      network: NETWORK,
      expiresAt: future,
      status: "active",
      createdAt: now,
    });

    const records = await ctx.db
      .query("devFixtureRecords")
      .withIndex("by_fixture", (query) => query.eq("fixtureName", fixtureName))
      .collect();
    return {
      fixtureName,
      reset: args.reset,
      counts: { documents: records.length, storageBlobs: args.evidenceStorageIds.length },
      personas: args.personas,
      routes: {
        openRfsId: String(openRfs.rfsId),
        publishedRfsId: String(publishedRfs.rfsId),
        skillId: String(skillId),
        authorHandle: "fixture-fulfiller",
        reviewId: String(publicReviewId),
        moderationReviewId: String(moderationReviewId),
        assignmentId: String(assignmentId),
        disputeId: String(disputeId),
        recoveryId: String(recoveryId),
      },
    };
  },
});

export const seed = internalAction({
  args: seedArgs,
  returns: seedResultValidator,
  handler: async (ctx, args) => {
    requireNonproduction();
    const evidenceStorageIds = await Promise.all([
      ctx.storage.store(new Blob(["Fixture public evidence: route matrix passed."], { type: "text/plain" })),
      ctx.storage.store(new Blob(["Fixture restricted evidence: scanner input under legal hold."], { type: "application/json" })),
    ]);
    try {
      return await ctx.runMutation(seedMutationRef, {
        fixtureName: args.fixtureName?.trim() || FIXTURE_NAME,
        reset: args.reset ?? true,
        personas: args.personas,
        evidenceStorageIds,
      });
    } catch (error) {
      await Promise.all(evidenceStorageIds.map((storageId) => ctx.storage.delete(storageId)));
      throw error;
    }
  },
});
