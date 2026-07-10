import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  assignmentPenalty,
  authorBondAmount,
  compareCandidates,
  criterionCoverageBps,
  logNormalizedBps,
  reliabilityBps,
  requiresAuthorBond,
  stakeholderPreferenceBps,
  totalAssignmentScore,
  type ReputationConfidence,
} from "./lib/assignmentPolicy";
import { canonicalJson, sha256Digest } from "./lib/contracts";
import { requirePolicyV2Enabled } from "./lib/featureFlags";
import { baseUnits, basisPoints, POLICY_V2 } from "./lib/policy";
import {
  getOrCreatePrincipalCluster,
  requireActiveRole,
  requirePrincipal,
  requireRecentPasskey,
} from "./lib/principals";

const criterionPlanValidator = v.object({
  criterionKey: v.string(),
  executionMethod: v.string(),
  expectedResult: v.string(),
  environment: v.string(),
  evidenceType: v.string(),
  etaMs: v.number(),
});

type CriterionPlan = {
  criterionKey: string;
  executionMethod: string;
  expectedResult: string;
  environment: string;
  evidenceType: string;
  etaMs: number;
};

const activeClusterFor = async (ctx: QueryCtx | MutationCtx, principalId: string) => {
  const memberships = await ctx.db
    .query("identityClusterMemberships")
    .withIndex("by_principal", (query) => query.eq("principalId", principalId))
    .collect();
  return memberships.find((membership) => membership.activeUntil === undefined)?.clusterId ?? null;
};

const primaryWalletFor = async (ctx: QueryCtx | MutationCtx, principalId: string) => {
  const wallet = await ctx.db
    .query("principalWallets")
    .withIndex("by_principal_and_primary", (query) =>
      query.eq("principalId", principalId).eq("primary", true),
    )
    .unique();
  return wallet?.status === "active" ? wallet : null;
};

const eligibilityReasons = async (
  ctx: QueryCtx | MutationCtx,
  args: { rfsId: Id<"rfs">; principalId: string; now: number },
) => {
  const reasons: string[] = [];
  const rfs = await ctx.db.get(args.rfsId);
  if (!rfs || rfs.policyVersion !== POLICY_V2.version) return { rfs: null, clusterId: null, wallet: null, reasons: ["rfs_not_found"] };
  if (rfs.status !== "funded") reasons.push("application_window_closed");
  if (!rfs.applicationDeadline || rfs.applicationDeadline <= args.now) reasons.push("application_deadline_passed");
  const clusterId = await activeClusterFor(ctx, args.principalId);
  const requesterClusterId = await activeClusterFor(ctx, rfs.authorUserId);
  if (!clusterId) reasons.push("identity_cluster_required");
  if (clusterId && requesterClusterId === clusterId) reasons.push("requester_cluster_conflict");
  const wallet = await primaryWalletFor(ctx, args.principalId);
  if (!wallet) reasons.push("verified_payout_wallet_required");
  if (clusterId) {
    const applications = await ctx.db
      .query("rfsApplications")
      .withIndex("by_cluster_and_rfs", (query) => query.eq("identityClusterId", clusterId).eq("rfsId", rfs._id))
      .collect();
    if (applications.some((application) => application.state === "active")) reasons.push("active_application_exists");
  }
  const assessments = await ctx.db
    .query("payoutAssessments")
    .withIndex("by_author_status", (query) => query.eq("authorUserId", args.principalId))
    .collect();
  if (assessments.some((assessment) => assessment.workflowStatus === "held" || assessment.workflowStatus === "human_review" && assessment.decisionKind === "harmful")) {
    reasons.push("unresolved_harmful_hold");
  }
  return { rfs, clusterId, wallet, reasons };
};

export const eligibility = query({
  args: { rfsId: v.id("rfs") },
  returns: v.object({ eligible: v.boolean(), reasons: v.array(v.string()), bondAcknowledgementRequired: v.boolean() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const result = await eligibilityReasons(ctx, { rfsId: args.rfsId, principalId: principal.principalId, now: Date.now() });
    return { eligible: result.reasons.length === 0, reasons: result.reasons, bondAcknowledgementRequired: (result.rfs?.workEscrowBaseUnits ?? BigInt(0)) >= POLICY_V2.highValueThreshold };
  },
});

const validatePlans = (criteria: Doc<"rfsCriteria">[], plans: CriterionPlan[], etaMs: number) => {
  if (!Number.isInteger(etaMs) || etaMs <= 0) throw new ConvexError({ code: "INVALID_ETA", message: "ETA must be a positive integer duration." });
  const criterionIds = new Set(criteria.map((criterion) => criterion.criterionKey));
  const planIds = new Set<string>();
  for (const plan of plans) {
    if (!criterionIds.has(plan.criterionKey) || planIds.has(plan.criterionKey)) throw new ConvexError({ code: "INVALID_PLAN", message: "Criterion plans must refer to each contract criterion at most once." });
    planIds.add(plan.criterionKey);
    if (plan.etaMs <= 0 || plan.etaMs > etaMs) throw new ConvexError({ code: "INVALID_PLAN", message: "Each criterion ETA must fit the application ETA." });
  }
};

const insertApplicationRevision = async (
  ctx: MutationCtx,
  args: { applicationId: Id<"rfsApplications">; principalId: string; revisionNumber: number; etaMs: number; environment: string; criterionPlans: CriterionPlan[]; evidenceMethod: string; relevantWorkReferences: string[]; bondAcknowledged: boolean; resourceVersion: number; withdrawn: boolean },
) => {
  const payload = {
    etaMs: args.etaMs,
    environment: args.environment.trim(),
    criterionPlans: args.criterionPlans,
    evidenceMethod: args.evidenceMethod.trim(),
    relevantWorkReferences: [...new Set(args.relevantWorkReferences.map((item) => item.trim()).filter(Boolean))],
    bondAcknowledged: args.bondAcknowledged,
    withdrawn: args.withdrawn,
  };
  return await ctx.db.insert("applicationRevisions", {
    applicationId: args.applicationId,
    revisionNumber: args.revisionNumber,
    principalId: args.principalId,
    etaMs: args.etaMs,
    environment: payload.environment,
    criterionPlansJson: canonicalJson(payload.criterionPlans),
    evidenceMethod: payload.evidenceMethod,
    relevantWorkReferences: payload.relevantWorkReferences,
    bondAcknowledged: args.bondAcknowledged,
    payloadDigest: sha256Digest(payload),
    resourceVersion: args.resourceVersion,
    withdrawn: args.withdrawn,
    createdAt: Date.now(),
  });
};

export const create = mutation({
  args: { rfsId: v.id("rfs"), etaMs: v.number(), environment: v.string(), criterionPlans: v.array(criterionPlanValidator), evidenceMethod: v.string(), relevantWorkReferences: v.array(v.string()), bondAcknowledged: v.boolean() },
  returns: v.object({ applicationId: v.id("rfsApplications"), revisionId: v.id("applicationRevisions"), resourceVersion: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requirePolicyV2Enabled(ctx, principal.principalId);
    const result = await eligibilityReasons(ctx, { rfsId: args.rfsId, principalId: principal.principalId, now: Date.now() });
    if (result.reasons.length > 0 || !result.rfs || !result.wallet) throw new ConvexError({ code: "INELIGIBLE", message: result.reasons.join(", ") });
    const clusterId = result.clusterId ?? await getOrCreatePrincipalCluster(ctx, principal.principalId);
    if (!result.rfs.currentRevisionId) throw new ConvexError({ code: "INVALID_STATE", message: "RFS contract is incomplete." });
    const criteria = await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", result.rfs!.currentRevisionId!)).collect();
    validatePlans(criteria, args.criterionPlans, args.etaMs);
    const revision = await ctx.db.get(result.rfs.currentRevisionId);
    if (!revision || args.etaMs > revision.deliveryLimitMs) throw new ConvexError({ code: "INVALID_ETA", message: "Application ETA exceeds the delivery limit." });
    if (result.rfs.workEscrowBaseUnits! >= POLICY_V2.highValueThreshold && !args.bondAcknowledged) throw new ConvexError({ code: "BOND_ACKNOWLEDGEMENT_REQUIRED", message: "High-value applications must acknowledge the possible bond." });
    const applicationId = await ctx.db.insert("rfsApplications", {
      rfsId: result.rfs._id,
      principalId: principal.principalId,
      identityClusterId: clusterId,
      payoutWalletId: result.wallet._id,
      etaMs: args.etaMs,
      bondAcknowledged: args.bondAcknowledged,
      state: "active",
      policyVersion: POLICY_V2.version,
      resourceVersion: 1,
      submittedAt: Date.now(),
    });
    const revisionId = await insertApplicationRevision(ctx, { applicationId, principalId: principal.principalId, revisionNumber: 1, ...args, resourceVersion: 1, withdrawn: false });
    await ctx.db.patch(applicationId, { currentRevisionId: revisionId });
    return { applicationId, revisionId, resourceVersion: 1 };
  },
});

export const revise = mutation({
  args: { applicationId: v.id("rfsApplications"), expectedResourceVersion: v.number(), etaMs: v.number(), environment: v.string(), criterionPlans: v.array(criterionPlanValidator), evidenceMethod: v.string(), relevantWorkReferences: v.array(v.string()), bondAcknowledged: v.boolean() },
  returns: v.object({ revisionId: v.id("applicationRevisions"), resourceVersion: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const application = await ctx.db.get(args.applicationId);
    if (!application || application.principalId !== principal.principalId) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found." });
    const rfs = await ctx.db.get(application.rfsId);
    if (!rfs || rfs.status !== "funded" || !rfs.applicationDeadline || rfs.applicationDeadline <= Date.now() || application.state !== "active") throw new ConvexError({ code: "INVALID_STATE", message: "Application can no longer be revised." });
    if (application.resourceVersion !== args.expectedResourceVersion) throw new ConvexError({ code: "STALE_RESOURCE", message: "Refresh the application before revising it." });
    const criteria = rfs.currentRevisionId ? await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect() : [];
    validatePlans(criteria, args.criterionPlans, args.etaMs);
    const previous = application.currentRevisionId ? await ctx.db.get(application.currentRevisionId) : null;
    const resourceVersion = application.resourceVersion + 1;
    const revisionId = await insertApplicationRevision(ctx, {
      applicationId: application._id,
      principalId: principal.principalId,
      revisionNumber: (previous?.revisionNumber ?? 0) + 1,
      etaMs: args.etaMs,
      environment: args.environment,
      criterionPlans: args.criterionPlans,
      evidenceMethod: args.evidenceMethod,
      relevantWorkReferences: args.relevantWorkReferences,
      bondAcknowledged: args.bondAcknowledged,
      resourceVersion,
      withdrawn: false,
    });
    await ctx.db.patch(application._id, { currentRevisionId: revisionId, etaMs: args.etaMs, bondAcknowledged: args.bondAcknowledged, resourceVersion });
    return { revisionId, resourceVersion };
  },
});

export const withdraw = mutation({
  args: { applicationId: v.id("rfsApplications"), expectedResourceVersion: v.number() },
  returns: v.literal("withdrawn"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const application = await ctx.db.get(args.applicationId);
    if (!application || application.principalId !== principal.principalId) throw new ConvexError({ code: "NOT_FOUND", message: "Application not found." });
    const rfs = await ctx.db.get(application.rfsId);
    if (!rfs || rfs.status !== "funded" || !rfs.applicationDeadline || rfs.applicationDeadline <= Date.now() || application.state !== "active") throw new ConvexError({ code: "INVALID_STATE", message: "Application can no longer be withdrawn." });
    if (application.resourceVersion !== args.expectedResourceVersion) throw new ConvexError({ code: "STALE_RESOURCE", message: "Refresh the application before withdrawing it." });
    const previous = application.currentRevisionId ? await ctx.db.get(application.currentRevisionId) : null;
    const resourceVersion = application.resourceVersion + 1;
    const revisionId = await insertApplicationRevision(ctx, {
      applicationId: application._id, principalId: principal.principalId, revisionNumber: (previous?.revisionNumber ?? 0) + 1,
      etaMs: application.etaMs, environment: previous?.environment ?? "", criterionPlans: previous ? JSON.parse(previous.criterionPlansJson) as CriterionPlan[] : [],
      evidenceMethod: previous?.evidenceMethod ?? "", relevantWorkReferences: previous?.relevantWorkReferences ?? [], bondAcknowledged: application.bondAcknowledged, resourceVersion, withdrawn: true,
    });
    await ctx.db.patch(application._id, { currentRevisionId: revisionId, state: "withdrawn", resourceVersion });
    return "withdrawn" as const;
  },
});

export const endorse = mutation({
  args: { applicationId: v.id("rfsApplications"), endorsed: v.boolean() },
  returns: v.object({ active: v.boolean() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const application = await ctx.db.get(args.applicationId);
    const rfs = application ? await ctx.db.get(application.rfsId) : null;
    if (!application || !rfs || rfs.status !== "funded" || !rfs.applicationDeadline || rfs.applicationDeadline <= Date.now()) throw new ConvexError({ code: "INVALID_STATE", message: "Endorsement window is closed." });
    const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
    const ownContribution = contributions.filter((item) => item.backerUserId === principal.principalId && item.status === "accepted").reduce((sum, item) => sum + (item.appliedAmountBaseUnits ?? item.amountBaseUnits), BigInt(0));
    const role = rfs.authorUserId === principal.principalId ? "requester" as const : ownContribution > BigInt(0) ? "backer" as const : null;
    if (!role) throw new ConvexError({ code: "FORBIDDEN", message: "Only the requester or a confirmed backer may endorse." });
    const clusterId = await getOrCreatePrincipalCluster(ctx, principal.principalId);
    const existing = await ctx.db.query("applicationEndorsements").withIndex("by_application_and_principal", (query) => query.eq("applicationId", application._id).eq("principalId", principal.principalId)).unique();
    const total = contributions.reduce((sum, item) => sum + (item.appliedAmountBaseUnits ?? item.amountBaseUnits), BigInt(0));
    const values = { rfsId: rfs._id, applicationId: application._id, principalId: principal.principalId, identityClusterId: clusterId, role, contributionShareNumerator: role === "requester" ? BigInt(0) : ownContribution, contributionShareDenominator: total, active: args.endorsed, createdAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("applicationEndorsements", values);
    return { active: args.endorsed };
  },
});

const confidenceRank = (confidence: string): ReputationConfidence =>
  confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "provisional";

const confidenceLevel: Readonly<Record<ReputationConfidence, number>> = {
  provisional: 0,
  low: 1,
  medium: 2,
  high: 3,
};

const scoreApplication = async (ctx: MutationCtx, rfs: Doc<"rfs">, application: Doc<"rfsApplications">, criteria: Doc<"rfsCriteria">[]) => {
  const revision = application.currentRevisionId ? await ctx.db.get(application.currentRevisionId) : null;
  if (!revision) throw new ConvexError({ code: "INVALID_STATE", message: "Application revision missing." });
  const plans = JSON.parse(revision.criterionPlansJson) as CriterionPlan[];
  let weightedQuality = 0;
  let qualityWeight = 0;
  let confidence: ReputationConfidence = "provisional";
  const tagSnapshots = await Promise.all([...new Set(criteria.flatMap((criterion) => criterion.tags))].map(async (tag) => await ctx.db.query("authorReputationSnapshots").withIndex("by_principal_and_tag", (query) => query.eq("principalId", application.principalId).eq("tag", tag)).unique()));
  const snapshotByTag = new Map(tagSnapshots.filter(Boolean).map((snapshot) => [snapshot!.tag, snapshot!]));
  for (const criterion of criteria) {
    for (const tag of criterion.tags.length ? criterion.tags : rfs.tags) {
      const snapshot = snapshotByTag.get(tag);
      weightedQuality += (snapshot?.adjustedScore ?? 50) * 100 * criterion.weightBps;
      qualityWeight += criterion.weightBps;
      if (snapshot && confidenceLevel[snapshot.confidence] > confidenceLevel[confidence]) confidence = snapshot.confidence;
    }
  }
  const tagQuality = basisPoints(Math.floor(qualityWeight ? weightedQuality / qualityWeight : 5_000));
  const assessments = await ctx.db.query("payoutAssessments").withIndex("by_author_status", (query) => query.eq("authorUserId", application.principalId)).collect();
  const finalized = assessments.filter((assessment) => assessment.workflowStatus === "finalized");
  const onTime = finalized.filter((assessment) => assessment.decisionKind !== "abandoned").length;
  const delivery = reliabilityBps(onTime, finalized.length);
  const relevant = finalized.filter((assessment) => {
    return assessment.decisionKind !== "harmful";
  }).length;
  const relevantWork = logNormalizedBps(relevant, 20);
  const authorSkills = await ctx.db.query("skills").filter((query) => query.eq(query.field("authorUserId"), application.principalId)).collect();
  const authorVersionIds = new Set(authorSkills.map((skill) => skill.publishedVersionId).filter(Boolean).map(String));
  const installs = await ctx.db.query("installEvents").collect();
  const downstream = logNormalizedBps(installs.filter((install) => authorVersionIds.has(String(install.skillVersionId)) && install.adoptionWeightBps > 0).length, 20);
  const plansByKey = new Map(plans.map((plan) => [plan.criterionKey, plan]));
  const coverage = criterionCoverageBps(criteria.map((criterion) => {
    const plan = plansByKey.get(criterion.criterionKey);
    return { weightBps: basisPoints(criterion.weightBps), hasExecutionMethod: Boolean(plan?.executionMethod.trim()), hasExpectedResult: Boolean(plan?.expectedResult.trim()), hasEnvironment: Boolean(plan?.environment.trim()), hasEvidenceType: Boolean(plan?.evidenceType.trim()), hasEta: Boolean(plan?.etaMs && plan.etaMs > 0) };
  }));
  const endorsements = await ctx.db.query("applicationEndorsements").withIndex("by_application", (query) => query.eq("applicationId", application._id)).collect();
  const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
  const endorsementByPrincipal = new Map(endorsements.filter((item) => item.active).map((item) => [item.principalId, item]));
  const contributionInputs = [];
  for (const contribution of contributions) {
    const clusterId = await activeClusterFor(ctx, contribution.backerUserId);
    if (!clusterId) continue;
    contributionInputs.push({ clusterId: String(clusterId), amountBaseUnits: baseUnits(contribution.appliedAmountBaseUnits ?? contribution.amountBaseUnits), endorsed: endorsementByPrincipal.has(contribution.backerUserId) });
  }
  const preference = stakeholderPreferenceBps({ requesterEndorsed: endorsements.some((item) => item.active && item.role === "requester"), applicantClusterId: String(application.identityClusterId), contributions: contributionInputs });
  const recentRestriction = finalized.filter((assessment) => (assessment.decisionKind === "harmful") && assessment.decidedAt).sort((left, right) => (right.decidedAt ?? 0) - (left.decidedAt ?? 0))[0];
  const penaltyResult = assignmentPenalty({ abandonmentCountLast12Months: finalized.filter((assessment) => assessment.decisionKind === "abandoned" && (assessment.decidedAt ?? 0) >= Date.now() - 365 * 24 * 60 * 60 * 1_000).length, finalizedRestriction: recentRestriction?.decidedAt ? { kind: "harmful", ageDays: (Date.now() - recentRestriction.decidedAt) / (24 * 60 * 60 * 1_000) } : undefined });
  if (!penaltyResult.eligible) return { eligible: false as const, reason: penaltyResult.reason };
  const components = { tagQualityBps: tagQuality, reliabilityBps: delivery, relevantWorkBps: relevantWork, downstreamBps: downstream, coverageBps: coverage, preferenceBps: preference, penaltyBps: penaltyResult.penaltyBps };
  return { eligible: true as const, components, total: totalAssignmentScore(components), confidence, relevantFinalizedWork: relevant, bondRequired: requiresAuthorBond(baseUnits(rfs.workEscrowBaseUnits ?? BigInt(0)), [...new Set(criteria.flatMap((criterion) => criterion.tags))].map((tag) => { const snapshot = snapshotByTag.get(tag); return { adjustedScore: snapshot?.adjustedScore ?? 50, confidence: confidenceRank(snapshot?.confidence ?? "provisional"), unresolvedHarmfulDispute: false, abandonmentRate: finalized.length ? finalized.filter((item) => item.decisionKind === "abandoned").length / finalized.length : 0 }; })) };
};

const openHighValueGate = async (ctx: MutationCtx, rfs: Doc<"rfs">, application: Doc<"rfsApplications">) => {
  const payloadDigest = sha256Digest({ rfsId: String(rfs._id), applicationId: String(application._id), scoreSnapshotJson: application.scoreSnapshotJson, contractDigest: rfs.contractDigest });
  await ctx.db.insert("humanActionRequests", {
    ownerPrincipalId: rfs.authorUserId,
    actionType: "confirm_high_value_assignment",
    resourceType: "rfsApplication",
    resourceId: String(application._id),
    payloadDigest,
    requestedBoundsJson: canonicalJson({ allowedRejections: ["identity_verification_failed", "wallet_verification_failed", "undisclosed_conflict", "falsified_reference", "active_security_restriction", "eta_capacity_contradiction"] }),
    reason: "High-value assignment requires trusted human eligibility confirmation.",
    status: "pending",
    expiresAt: Date.now() + POLICY_V2.humanDisputeSloMs,
    createdAt: Date.now(),
  });
};

export const closeApplications = internalMutation({
  args: { rfsId: v.id("rfs"), now: v.optional(v.number()) },
  returns: v.object({ state: v.string(), selectedApplicationId: v.optional(v.id("rfsApplications")) }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version || rfs.status !== "funded") return { state: "unchanged" };
    if (!rfs.applicationDeadline || rfs.applicationDeadline > now) return { state: "not_due" };
    const applications = await ctx.db.query("rfsApplications").withIndex("by_rfs_and_state", (query) => query.eq("rfsId", rfs._id).eq("state", "active")).collect();
    const criteria = rfs.currentRevisionId ? await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect() : [];
    const candidates = [];
    for (const application of applications) {
      const scored = await scoreApplication(ctx, rfs, application, criteria);
      if (!scored.eligible) {
        await ctx.db.patch(application._id, { state: "ineligible", closedAt: now, scoreSnapshotJson: canonicalJson({ reason: scored.reason }) });
        continue;
      }
      candidates.push({ application, scored });
    }
    candidates.sort((left, right) => compareCandidates({ applicationId: String(left.application._id), scoreBps: left.scored.total, confidence: left.scored.confidence, relevantFinalizedWork: left.scored.relevantFinalizedWork, submittedAt: left.application.submittedAt }, { applicationId: String(right.application._id), scoreBps: right.scored.total, confidence: right.scored.confidence, relevantFinalizedWork: right.scored.relevantFinalizedWork, submittedAt: right.application.submittedAt }));
    if (candidates.length === 0) {
      if ((rfs.applicationWindowRound ?? 1) < 2) {
        await ctx.db.patch(rfs._id, { applicationWindowRound: 2, applicationDeadline: now + POLICY_V2.applicationWindowMs[rfs.riskTier ?? "low"], resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
        return { state: "reopened" };
      }
      if (!rfs.currentRevisionId) throw new ConvexError({ code: "INVALID_CONTRACT", message: "RFS revision is unavailable." });
      const revision = await ctx.db.get(rfs.currentRevisionId);
      if (!revision) throw new ConvexError({ code: "INVALID_CONTRACT", message: "RFS revision is unavailable." });
      const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
      for (const contribution of contributions.filter((item) => item.status === "accepted")) {
        const sourceId = `no-candidate:${String(contribution._id)}`;
        const existing = await ctx.db.query("settlementObligations").withIndex("by_source", (query) => query.eq("sourceType", "rfs_work").eq("sourceId", sourceId)).first();
        if (existing) continue;
        const wallet = contribution.payerWalletId ? await ctx.db.get(contribution.payerWalletId) : null;
        if (!wallet) throw new ConvexError({ code: "SETTLEMENT_WALLET_REQUIRED", message: "Backer refund wallet is unavailable." });
        await ctx.db.insert("settlementObligations", {
          sourceType: "rfs_work", sourceId, beneficiaryPrincipalId: contribution.backerUserId,
          kind: "backer_refund", amountBaseUnits: contribution.appliedAmountBaseUnits ?? contribution.amountBaseUnits,
          walletId: wallet._id, recipientAddressSnapshot: wallet.address, tokenAddress: revision.tokenAddress,
          network: revision.network, decisionReference: "second_application_window_empty",
          policyVersion: POLICY_V2.version, state: "pending", createdAt: now,
        });
      }
      await ctx.db.patch(rfs._id, { status: "cancelled", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
      return { state: "cancelled_refunds_created" };
    }
    for (let index = 0; index < candidates.length; index += 1) {
      const { application, scored } = candidates[index];
      const rank = index + 1;
      const scoreSnapshotJson = canonicalJson({ algorithmVersion: 2, components: scored.components, tieBreak: { confidence: scored.confidence, relevantFinalizedWork: scored.relevantFinalizedWork, submittedAt: application.submittedAt, applicationId: String(application._id) } });
      await ctx.db.patch(application._id, {
        state: index === 0 ? "selected" : "waitlisted", scoreSnapshotJson,
        qualityScoreBps: scored.components.tagQualityBps, deliveryScoreBps: scored.components.reliabilityBps,
        verificationScoreBps: scored.components.coverageBps, endorsementScoreBps: scored.components.preferenceBps,
        etaScoreBps: scored.components.relevantWorkBps, riskPenaltyBps: scored.components.penaltyBps,
        totalScoreBps: scored.total, rank, tieBreakJson: canonicalJson({ confidence: scored.confidence, relevantFinalizedWork: scored.relevantFinalizedWork, submittedAt: application.submittedAt }), bondRequired: scored.bondRequired, closedAt: now,
      });
    }
    const winner = candidates[0];
    await ctx.db.patch(rfs._id, { selectedApplicationId: winner.application._id, resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    if ((rfs.workEscrowBaseUnits ?? BigInt(0)) >= POLICY_V2.highValueThreshold) {
      const refreshed = await ctx.db.get(winner.application._id);
      if (refreshed) await openHighValueGate(ctx, rfs, refreshed);
      return { state: winner.scored.bondRequired ? "bond_and_human_required" : "human_required", selectedApplicationId: winner.application._id };
    }
    await ctx.db.patch(rfs._id, { claimantUserId: winner.application.principalId, status: "assigned", deliveryDeadline: now + winner.application.etaMs, resourceVersion: (rfs.resourceVersion ?? 1) + 2 });
    return { state: "assigned", selectedApplicationId: winner.application._id };
  },
});

const rejectionValidator = v.union(v.literal("identity_verification_failed"), v.literal("wallet_verification_failed"), v.literal("undisclosed_conflict"), v.literal("falsified_reference"), v.literal("active_security_restriction"), v.literal("eta_capacity_contradiction"));

export const confirmHighValueAssignment = mutation({
  args: { applicationId: v.id("rfsApplications"), approved: v.boolean(), rejectionReason: v.optional(rejectionValidator) },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, principal);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const application = await ctx.db.get(args.applicationId);
    const rfs = application ? await ctx.db.get(application.rfsId) : null;
    if (!application || !rfs || rfs.selectedApplicationId !== application._id || application.state !== "selected") throw new ConvexError({ code: "INVALID_STATE", message: "Selected application not found." });
    const request = (await ctx.db.query("humanActionRequests").withIndex("by_resource", (query) => query.eq("resourceType", "rfsApplication").eq("resourceId", String(application._id))).collect()).find((item) => item.actionType === "confirm_high_value_assignment" && item.status === "pending");
    if (!request || request.expiresAt <= Date.now()) throw new ConvexError({ code: "HUMAN_ACTION_REQUIRED", message: "Active confirmation request not found." });
    if (!args.approved && !args.rejectionReason) throw new ConvexError({ code: "REJECTION_REASON_REQUIRED", message: "Use an enumerated eligibility reason." });
    if (args.approved && application.bondRequired) {
      const bond = await ctx.db.query("bondEscrows").withIndex("by_application", (query) => query.eq("applicationId", application._id)).unique();
      if (!bond || bond.state !== "funded") throw new ConvexError({ code: "BOND_REQUIRED", message: `A confirmed ${authorBondAmount(baseUnits(rfs.workEscrowBaseUnits ?? BigInt(0))).toString()} base-unit bond is required.` });
    }
    await ctx.db.patch(request._id, { status: args.approved ? "approved" : "declined", resolvedByPrincipalId: principal.principalId, resolvedSessionId: principal.sessionId, resolutionReference: args.approved ? "eligibility_confirmed" : args.rejectionReason, resolvedAt: Date.now() });
    if (!args.approved) {
      await ctx.db.patch(application._id, { state: "rejected" });
      const waitlisted = await ctx.db.query("rfsApplications").withIndex("by_rfs_and_state", (query) => query.eq("rfsId", rfs._id).eq("state", "waitlisted")).collect();
      const next = waitlisted.sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))[0];
      if (!next) return { state: "no_candidate" };
      await ctx.db.patch(next._id, { state: "selected" });
      await ctx.db.patch(rfs._id, { selectedApplicationId: next._id, resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
      const refreshed = await ctx.db.get(next._id);
      if (refreshed) await openHighValueGate(ctx, rfs, refreshed);
      return { state: "next_candidate" };
    }
    await ctx.db.patch(rfs._id, { claimantUserId: application.principalId, status: "assigned", deliveryDeadline: Date.now() + application.etaMs, resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    return { state: "assigned" };
  },
});

export const listForRfs = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    const rows = await ctx.db.query("rfsApplications").filter((query) => query.eq(query.field("rfsId"), args.rfsId)).collect();
    if (rfs?.authorUserId === principal.principalId) return rows.map((row) => ({ ...row, viewerCanEdit: row.principalId === principal.principalId }));
    return rows.filter((row) => row.principalId === principal.principalId).map((row) => ({ ...row, viewerCanEdit: true }));
  },
});

export const getAssignment = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || !rfs.selectedApplicationId) return null;
    const application = await ctx.db.get(rfs.selectedApplicationId);
    if (!application || (rfs.authorUserId !== principal.principalId && application.principalId !== principal.principalId)) return null;
    return { rfsId: rfs._id, applicationId: application._id, state: application.state, principalId: application.principalId === principal.principalId ? application.principalId : undefined, scoreSnapshotJson: application.scoreSnapshotJson, totalScoreBps: application.totalScoreBps, rank: application.rank, bondRequired: application.bondRequired, deliveryDeadline: rfs.deliveryDeadline };
  },
});
