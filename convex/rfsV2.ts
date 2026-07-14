import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { canonicalJson, sha256Digest } from "./lib/contracts";
import { requirePolicyV2Enabled } from "./lib/featureFlags";
import { cleanTags, walletAddressValidator } from "./lib/helpers";
import {
  baseUnits,
  POLICY_V2,
  reviewReserveFor,
  riskTierForWorkEscrow,
  validateCriteria,
  type ContractCriterion,
} from "./lib/policy";
import { requirePrincipal } from "./lib/principals";
import { fallbackAuthorHandle } from "./lib/publicIdentity";

const DAY_MS = 24 * 60 * 60 * 1_000;

const passConditionValidator = v.union(
  v.object({ kind: v.literal("boolean_assertion"), assertion: v.string() }),
  v.object({
    kind: v.literal("numeric_threshold"),
    metric: v.string(),
    operator: v.union(v.literal("gte"), v.literal("lte")),
    value: v.string(),
  }),
  v.object({
    kind: v.literal("fixture_assertion"),
    fixtureVersion: v.string(),
    assertion: v.string(),
  }),
);

const criterionValidator = v.object({
  id: v.string(),
  title: v.string(),
  passCondition: passConditionValidator,
  verificationMethod: v.string(),
  weightBps: v.number(),
  tags: v.array(v.string()),
  requiredForPublication: v.boolean(),
});

const createArgs = {
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  tags: v.array(v.string()),
  targetEnvironments: v.array(v.string()),
  criteria: v.array(criterionValidator),
  workEscrowBaseUnits: v.int64(),
  minimumContributionBaseUnits: v.int64(),
  tokenAddress: v.string(),
  network: v.string(),
  fundingDurationDays: v.optional(v.number()),
  deliveryDurationDays: v.optional(v.number()),
  consideredResourceIds: v.array(v.string()),
  unmetGapReason: v.string(),
};

type CreateInput = {
  title: string;
  description: string;
  scope: string;
  tags: string[];
  targetEnvironments: string[];
  criteria: ContractCriterion[];
  workEscrowBaseUnits: bigint;
  minimumContributionBaseUnits: bigint;
  tokenAddress: string;
  network: string;
  fundingDurationDays?: number;
  deliveryDurationDays?: number;
  consideredResourceIds: string[];
  unmetGapReason: string;
};

const normalizedContract = (args: CreateInput, now: number) => {
  const title = args.title.trim();
  const description = args.description.trim();
  const scope = args.scope.trim();
  const tags = cleanTags(args.tags);
  const targetEnvironments = [...new Set(args.targetEnvironments.map((item) => item.trim()).filter(Boolean))];
  const criteria = args.criteria.map((criterion) => ({
    ...criterion,
    id: criterion.id.trim(),
    title: criterion.title.trim(),
    verificationMethod: criterion.verificationMethod.trim(),
    tags: cleanTags([...criterion.tags]),
  }));
  const validation = validateCriteria(criteria);
  if (!validation.valid) {
    throw new ConvexError({ code: "INVALID_CRITERIA", message: validation.errors.join(" ") });
  }
  if (!title || !description || !scope || tags.length === 0 || targetEnvironments.length === 0) {
    throw new ConvexError({ code: "INVALID_CONTRACT", message: "Title, description, scope, tags, and target environments are required." });
  }
  if (!args.unmetGapReason.trim()) {
    throw new ConvexError({ code: "PREFLIGHT_REQUIRED", message: "Record why considered resources do not meet this request." });
  }
  if (args.workEscrowBaseUnits <= BigInt(0)) {
    throw new ConvexError({ code: "INVALID_AMOUNT", message: "Work escrow must be positive." });
  }
  if (
    args.minimumContributionBaseUnits <= BigInt(0) ||
    args.minimumContributionBaseUnits > args.workEscrowBaseUnits
  ) {
    throw new ConvexError({ code: "INVALID_AMOUNT", message: "Minimum contribution is outside the contract range." });
  }
  const tokenAddress = args.tokenAddress.trim().toLowerCase();
  if (!walletAddressValidator.test(tokenAddress)) {
    throw new ConvexError({ code: "INVALID_TOKEN", message: "A valid settlement token address is required." });
  }
  const fundingDays = args.fundingDurationDays ?? 14;
  const deliveryDays = args.deliveryDurationDays ?? 7;
  if (!Number.isInteger(fundingDays) || fundingDays < 1 || fundingDays > 30) {
    throw new ConvexError({ code: "INVALID_DEADLINE", message: "Funding duration must be 1-30 days." });
  }
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1 || deliveryDays > 30) {
    throw new ConvexError({ code: "INVALID_DEADLINE", message: "Delivery duration must be 1-30 days." });
  }
  const reviewReserveBaseUnits = reviewReserveFor(baseUnits(args.workEscrowBaseUnits));
  const totalFundingTargetBaseUnits = args.workEscrowBaseUnits + reviewReserveBaseUnits;
  return {
    title,
    description,
    scope,
    tags,
    targetEnvironments,
    criteria,
    workEscrowBaseUnits: args.workEscrowBaseUnits,
    reviewReserveBaseUnits,
    totalFundingTargetBaseUnits,
    minimumContributionBaseUnits: args.minimumContributionBaseUnits,
    tokenAddress,
    network: args.network.trim().toLowerCase(),
    fundingDeadline: now + fundingDays * DAY_MS,
    deliveryLimitMs: deliveryDays * DAY_MS,
    consideredResourceIds: [...new Set(args.consideredResourceIds.map((item) => item.trim()).filter(Boolean))],
    unmetGapReason: args.unmetGapReason.trim(),
  };
};

const insertRevision = async (
  ctx: MutationCtx,
  args: {
    rfsId: Id<"rfs">;
    principalId: string;
    revisionNumber: number;
    contract: ReturnType<typeof normalizedContract>;
    now: number;
  },
) => {
  const fixtureIds = args.contract.criteria.flatMap((criterion) =>
    criterion.passCondition.kind === "fixture_assertion"
      ? [criterion.passCondition.fixtureVersion as Id<"fixtureVersions">]
      : [],
  );
  const fixtures = await Promise.all(fixtureIds.map((fixtureId) => ctx.db.get(fixtureId)));
  for (const fixture of fixtures) {
    if (!fixture || (fixture.visibility === "restricted" && fixture.ownerPrincipalId !== args.principalId)) {
      throw new ConvexError({ code: "INVALID_FIXTURE", message: "A referenced fixture is missing or not owned by this requester." });
    }
  }
  const fixtureDigest = fixtures.length
    ? sha256Digest(fixtures.map((fixture) => ({ id: String(fixture!._id), manifestSha256: fixture!.manifestSha256, bundleSha256: fixture!.bundleSha256, version: fixture!.version })))
    : undefined;
  const criteriaDigest = sha256Digest(args.contract.criteria);
  const contractDigest = sha256Digest({
    ...args.contract,
    reviewReserveBaseUnits: args.contract.reviewReserveBaseUnits.toString(),
    consideredResourceIds: args.contract.consideredResourceIds,
    unmetGapReason: args.contract.unmetGapReason,
    policyVersion: POLICY_V2.version,
  });
  const revisionId = await ctx.db.insert("rfsRevisions", {
    rfsId: args.rfsId,
    revisionNumber: args.revisionNumber,
    authorPrincipalId: args.principalId,
    title: args.contract.title,
    description: args.contract.description,
    scope: args.contract.scope,
    tags: args.contract.tags,
    targetEnvironments: args.contract.targetEnvironments,
    criteriaDigest,
    fixtureDigest,
    workEscrowBaseUnits: args.contract.workEscrowBaseUnits,
    reviewReserveBaseUnits: args.contract.reviewReserveBaseUnits,
    totalFundingTargetBaseUnits: args.contract.totalFundingTargetBaseUnits,
    tokenAddress: args.contract.tokenAddress,
    network: args.contract.network,
    fundingDeadline: args.contract.fundingDeadline,
    deliveryLimitMs: args.contract.deliveryLimitMs,
    contractDigest,
    policyVersion: POLICY_V2.version,
    status: "draft",
    createdAt: args.now,
  });
  for (const criterion of args.contract.criteria) {
    const passCondition = canonicalJson(criterion.passCondition);
    await ctx.db.insert("rfsCriteria", {
      rfsId: args.rfsId,
      revisionId,
      criterionKey: criterion.id,
      title: criterion.title,
      passConditionKind: criterion.passCondition.kind,
      passCondition,
      verificationMethod: criterion.verificationMethod,
      weightBps: criterion.weightBps,
      requiredForPublication: criterion.requiredForPublication,
      tags: [...criterion.tags],
      fixtureVersionId: criterion.passCondition.kind === "fixture_assertion" ? criterion.passCondition.fixtureVersion as Id<"fixtureVersions"> : undefined,
      createdAt: args.now,
    });
  }
  return { revisionId, contractDigest, criteriaDigest };
};

export const validateDraft = query({
  args: createArgs,
  returns: v.object({ valid: v.boolean(), riskTier: v.string(), reviewReserveBaseUnits: v.int64(), totalFundingTargetBaseUnits: v.int64() }),
  handler: async (_ctx, args) => {
    const contract = normalizedContract(args, Date.now());
    return {
      valid: true,
      riskTier: riskTierForWorkEscrow(baseUnits(contract.workEscrowBaseUnits)),
      reviewReserveBaseUnits: contract.reviewReserveBaseUnits,
      totalFundingTargetBaseUnits: contract.totalFundingTargetBaseUnits,
    };
  },
});

export const similar = query({
  args: { title: v.string(), tags: v.array(v.string()), limit: v.optional(v.number()) },
  returns: v.array(v.object({ resourceType: v.string(), resourceId: v.string(), title: v.string(), scoreBps: v.number(), matchedTags: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const tags = new Set(cleanTags(args.tags));
    const words = new Set(args.title.toLowerCase().split(/\s+/).filter((word) => word.length > 2));
    const [projections, requests] = await Promise.all([
      ctx.db.query("discoveryProjection").take(100),
      ctx.db.query("rfs").withIndex("by_status", (query) => query.eq("status", "open")).take(100),
    ]);
    const candidates: Array<{ resourceType: string; resourceId: string; title: string; scoreBps: number; matchedTags: string[] }> = [];
    for (const projection of projections) {
      const skill = await ctx.db.get(projection.skillId);
      if (!skill) continue;
      const matchedTags = projection.tags.filter((tag) => tags.has(tag));
      const tagScore = tags.size === 0 ? 0 : Math.floor((matchedTags.length * 7_000) / tags.size);
      candidates.push({ resourceType: "skill", resourceId: String(skill._id), title: skill.summary, scoreBps: Math.min(10_000, tagScore), matchedTags });
    }
    for (const request of requests) {
      const matchedTags = request.tags.filter((tag) => tags.has(tag));
      const matchedWords = request.title.toLowerCase().split(/\s+/).filter((word) => words.has(word)).length;
      const scoreBps = Math.min(10_000, (tags.size ? Math.floor((matchedTags.length * 7_000) / tags.size) : 0) + Math.min(3_000, matchedWords * 1_000));
      candidates.push({ resourceType: "rfs", resourceId: String(request._id), title: request.title, scoreBps, matchedTags });
    }
    return candidates.sort((left, right) => right.scoreBps - left.scoreBps || left.resourceId.localeCompare(right.resourceId)).slice(0, Math.min(20, Math.max(1, args.limit ?? 10)));
  },
});

export const create = mutation({
  args: createArgs,
  returns: v.object({ rfsId: v.id("rfs"), revisionId: v.id("rfsRevisions"), contractDigest: v.string(), resourceVersion: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requirePolicyV2Enabled(ctx, principal.principalId);
    const now = Date.now();
    const contract = normalizedContract(args, now);
    const rfsId = await ctx.db.insert("rfs", {
      authorUserId: principal.principalId,
      title: contract.title,
      description: contract.description,
      scope: contract.scope,
      tags: contract.tags,
      fundingThresholdBaseUnits: contract.totalFundingTargetBaseUnits,
      minimumContributionBaseUnits: contract.minimumContributionBaseUnits,
      currentAmountBaseUnits: BigInt(0),
      reservedFundingBaseUnits: BigInt(0),
      fundingTokenAddress: contract.tokenAddress,
      status: "open",
      policyVersion: POLICY_V2.version,
      riskTier: riskTierForWorkEscrow(baseUnits(contract.workEscrowBaseUnits)),
      workEscrowBaseUnits: contract.workEscrowBaseUnits,
      reviewReserveBaseUnits: contract.reviewReserveBaseUnits,
      totalFundingTargetBaseUnits: contract.totalFundingTargetBaseUnits,
      fundingDeadline: contract.fundingDeadline,
      humanReviewRequired: contract.workEscrowBaseUnits >= POLICY_V2.highValueThreshold,
      resourceVersion: 1,
    });
    const revision = await insertRevision(ctx, { rfsId, principalId: principal.principalId, revisionNumber: 1, contract, now });
    await ctx.db.patch(rfsId, { currentRevisionId: revision.revisionId, contractDigest: revision.contractDigest });
    return { rfsId, revisionId: revision.revisionId, contractDigest: revision.contractDigest, resourceVersion: 1 };
  },
});

const assertDraftMutable = async (ctx: MutationCtx, rfs: Doc<"rfs">) => {
  if (rfs.policyVersion !== POLICY_V2.version || rfs.status !== "open" || !rfs.currentRevisionId) {
    throw new ConvexError({ code: "INVALID_STATE", message: "Only an open policy-v2 draft can be changed." });
  }
  if (rfs.currentAmountBaseUnits > BigInt(0) || (rfs.reservedFundingBaseUnits ?? BigInt(0)) > BigInt(0)) {
    throw new ConvexError({ code: "CONTRACT_IMMUTABLE", message: "Funding activity has frozen this contract." });
  }
  const activeIntents = await ctx.db
    .query("paymentIntents")
    .withIndex("by_principal_resource_and_state")
    .filter((query) => query.and(query.eq(query.field("resourceType"), "rfs_funding"), query.eq(query.field("resourceId"), String(rfs._id))))
    .take(1);
  if (activeIntents.length > 0) {
    throw new ConvexError({ code: "CONTRACT_IMMUTABLE", message: "A payment intent has frozen this contract revision." });
  }
  return await ctx.db.get(rfs.currentRevisionId);
};

export const reviseDraft = mutation({
  args: { rfsId: v.id("rfs"), expectedResourceVersion: v.number(), ...createArgs },
  returns: v.object({ revisionId: v.id("rfsRevisions"), contractDigest: v.string(), resourceVersion: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.authorUserId !== principal.principalId) throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    if ((rfs.resourceVersion ?? 1) !== args.expectedResourceVersion) throw new ConvexError({ code: "STALE_RESOURCE", message: "Refresh the RFS before changing it." });
    const previous = await assertDraftMutable(ctx, rfs);
    if (!previous) throw new ConvexError({ code: "INVALID_STATE", message: "Current revision not found." });
    const now = Date.now();
    const contract = normalizedContract(args, now);
    const revision = await insertRevision(ctx, { rfsId: rfs._id, principalId: principal.principalId, revisionNumber: previous.revisionNumber + 1, contract, now });
    await ctx.db.patch(previous._id, { status: "superseded", supersededAt: now });
    const resourceVersion = (rfs.resourceVersion ?? 1) + 1;
    await ctx.db.patch(rfs._id, {
      title: contract.title, description: contract.description, scope: contract.scope, tags: contract.tags,
      fundingThresholdBaseUnits: contract.totalFundingTargetBaseUnits,
      minimumContributionBaseUnits: contract.minimumContributionBaseUnits,
      fundingTokenAddress: contract.tokenAddress,
      workEscrowBaseUnits: contract.workEscrowBaseUnits,
      reviewReserveBaseUnits: contract.reviewReserveBaseUnits,
      totalFundingTargetBaseUnits: contract.totalFundingTargetBaseUnits,
      fundingDeadline: contract.fundingDeadline,
      currentRevisionId: revision.revisionId,
      contractDigest: revision.contractDigest,
      riskTier: riskTierForWorkEscrow(baseUnits(contract.workEscrowBaseUnits)),
      humanReviewRequired: contract.workEscrowBaseUnits >= POLICY_V2.highValueThreshold,
      resourceVersion,
    });
    return { revisionId: revision.revisionId, contractDigest: revision.contractDigest, resourceVersion };
  },
});

export const cancelDraft = mutation({
  args: { rfsId: v.id("rfs"), expectedResourceVersion: v.number() },
  returns: v.literal("cancelled"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.authorUserId !== principal.principalId) throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    if ((rfs.resourceVersion ?? 1) !== args.expectedResourceVersion) throw new ConvexError({ code: "STALE_RESOURCE", message: "Refresh the RFS before cancelling it." });
    const revision = await assertDraftMutable(ctx, rfs);
    const now = Date.now();
    if (revision) await ctx.db.patch(revision._id, { status: "cancelled", cancelledAt: now });
    await ctx.db.patch(rfs._id, { status: "cancelled", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    return "cancelled" as const;
  },
});

export const get = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version || !rfs.currentRevisionId) return null;
    const [revision, criteria, authorProfile, claimantProfile, assessment, skill, evidence] = await Promise.all([
      ctx.db.get(rfs.currentRevisionId),
      ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect(),
      ctx.db.query("publicProfiles").withIndex("by_principal", (query) => query.eq("principalId", rfs.authorUserId)).unique(),
      rfs.claimantUserId ? ctx.db.query("publicProfiles").withIndex("by_principal", (query) => query.eq("principalId", rfs.claimantUserId!)).unique() : null,
      ctx.db.query("payoutAssessments").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).first(),
      ctx.db.query("skills").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).first(),
      ctx.db.query("evidenceArtifacts").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect(),
    ]);
    const version = skill?.publishedVersionId ? await ctx.db.get(skill.publishedVersionId) : null;
    return {
      rfs: {
        rfsId: rfs._id,
        title: rfs.title,
        description: rfs.description,
        scope: rfs.scope,
        tags: rfs.tags,
        status: rfs.status,
        policyVersion: rfs.policyVersion,
        riskTier: rfs.riskTier,
        authorHandle: authorProfile?.handle ?? fallbackAuthorHandle(rfs.authorUserId),
        selectedAuthorHandle: claimantProfile?.handle,
        workEscrowBaseUnits: rfs.workEscrowBaseUnits,
        reviewReserveBaseUnits: rfs.reviewReserveBaseUnits,
        totalFundingTargetBaseUnits: rfs.totalFundingTargetBaseUnits,
        fundedBaseUnits: rfs.currentAmountBaseUnits,
        fundingDeadline: rfs.fundingDeadline,
        applicationDeadline: rfs.applicationDeadline,
        deliveryDeadline: rfs.deliveryDeadline,
        revisionDeadline: rfs.revisionDeadline,
        contractDigest: rfs.contractDigest,
        resourceVersion: rfs.resourceVersion,
      },
      revision: revision ? {
        revisionId: revision._id,
        revisionNumber: revision.revisionNumber,
        status: revision.status,
        targetEnvironments: revision.targetEnvironments,
        fixtureDigest: revision.fixtureDigest,
        contractDigest: revision.contractDigest,
        createdAt: revision.createdAt,
        frozenAt: revision.frozenAt,
      } : null,
      criteria: criteria.map((criterion) => ({
        criterionId: criterion._id,
        criterionKey: criterion.criterionKey,
        title: criterion.title,
        passCondition: criterion.passCondition,
        verificationMethod: criterion.verificationMethod,
        weightBps: criterion.weightBps,
        requiredForPublication: criterion.requiredForPublication,
        tags: criterion.tags,
        fixtureVersionId: criterion.fixtureVersionId,
      })),
      submission: skill && version ? {
        skillId: skill._id,
        skillVersionId: version._id,
        version: version.version,
        contentHash: version.contentHash,
        digestAlgorithm: version.digestAlgorithm,
        summary: version.summary,
        quarantineState: version.quarantineState ?? "clear",
        status: version.status,
        publishedAt: version.publishedAt,
      } : null,
      assessment: assessment ? {
        status: assessment.status,
        workflowStatus: assessment.workflowStatus,
        decisionKind: assessment.decisionKind,
        passedWeightBps: assessment.passedWeightBps,
        assessmentReason: assessment.assessmentReason,
        decidedAt: assessment.decidedAt,
      } : null,
      publicEvidence: evidence.filter((artifact) => !artifact.deletedAt).map((artifact) => ({
        artifactId: artifact._id,
        criterionId: artifact.criterionId,
        classification: artifact.classification,
        publicRedaction: artifact.publicRedaction,
        verificationState: artifact.verificationState,
        scanState: artifact.scanState,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        createdAt: artifact.createdAt,
      })),
    };
  },
});

export const listRevisions = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => (await ctx.db.query("rfsRevisions").withIndex("by_rfs_and_revisionNumber", (query) => query.eq("rfsId", args.rfsId)).collect()).map((revision) => ({
    revisionId: revision._id,
    revisionNumber: revision.revisionNumber,
    status: revision.status,
    targetEnvironments: revision.targetEnvironments,
    fixtureDigest: revision.fixtureDigest,
    contractDigest: revision.contractDigest,
    createdAt: revision.createdAt,
    frozenAt: revision.frozenAt,
    cancelledAt: revision.cancelledAt,
  })),
});

export const listPublic = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("rfs").order("desc").take(Math.min(100, args.limit ?? 25));
    return rows.filter((row) => row.policyVersion === POLICY_V2.version && (!args.status || row.status === args.status)).map((row) => ({
      rfsId: row._id, title: row.title, description: row.description, scope: row.scope, tags: row.tags,
      status: row.status, workEscrowBaseUnits: row.workEscrowBaseUnits,
      reviewReserveBaseUnits: row.reviewReserveBaseUnits, totalFundingTargetBaseUnits: row.totalFundingTargetBaseUnits,
      fundedBaseUnits: row.currentAmountBaseUnits, fundingDeadline: row.fundingDeadline,
      applicationDeadline: row.applicationDeadline, policyVersion: row.policyVersion,
      riskTier: row.riskTier, contractDigest: row.contractDigest, resourceVersion: row.resourceVersion,
    }));
  },
});

export const expireFunding = internalMutation({
  args: { rfsId: v.id("rfs"), now: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version || rfs.status !== "open" || !rfs.fundingDeadline || rfs.fundingDeadline > now || !rfs.currentRevisionId) return "unchanged";
    const activeIntents = await ctx.db.query("paymentIntents").filter((query) => query.and(query.eq(query.field("resourceType"), "rfs_funding"), query.eq(query.field("resourceId"), String(rfs._id)), query.or(query.eq(query.field("state"), "reserved"), query.eq(query.field("state"), "challenged")), query.gt(query.field("expiresAt"), now))).take(1);
    if (activeIntents.length > 0) return "pending_intent";
    const revision = await ctx.db.get(rfs.currentRevisionId);
    if (!revision) throw new ConvexError({ code: "INVALID_CONTRACT", message: "RFS revision is unavailable." });
    const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
    for (const contribution of contributions.filter((item) => item.status === "accepted" && (item.appliedAmountBaseUnits ?? item.amountBaseUnits) > BigInt(0))) {
      const sourceId = `funding-expired:${String(contribution._id)}`;
      const existing = await ctx.db.query("settlementObligations").withIndex("by_source", (query) => query.eq("sourceType", "rfs_work").eq("sourceId", sourceId)).first();
      if (existing) continue;
      const wallet = contribution.payerWalletId ? await ctx.db.get(contribution.payerWalletId) : null;
      if (!wallet) throw new ConvexError({ code: "SETTLEMENT_WALLET_REQUIRED", message: "Backer refund wallet is unavailable." });
      await ctx.db.insert("settlementObligations", {
        sourceType: "rfs_work", sourceId, beneficiaryPrincipalId: contribution.backerUserId,
        kind: "backer_refund", amountBaseUnits: contribution.appliedAmountBaseUnits ?? contribution.amountBaseUnits,
        walletId: wallet._id, recipientAddressSnapshot: wallet.address, tokenAddress: revision.tokenAddress,
        network: revision.network, decisionReference: "funding_deadline_expired",
        policyVersion: POLICY_V2.version, state: "pending", createdAt: now,
      });
    }
    await ctx.db.patch(revision._id, { status: "cancelled", cancelledAt: now });
    await ctx.db.patch(rfs._id, { status: "cancelled", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    return "cancelled_refunds_created";
  },
});
