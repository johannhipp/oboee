import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { acceptanceQuorum, harmfulHold, nextReviewAssignmentFee, reductionQuorum, type EvaluationSignal } from "./lib/evaluationPolicy";
import { calculateCriterionDecision, POLICY_V2, baseUnits, type ContractCriterion, type CriterionResult } from "./lib/policy";
import { getOrCreatePrincipalCluster, requireActiveRole, requirePrincipal, requireRecentPasskey } from "./lib/principals";
import { emitFinalRfsReputation } from "./reputation";
import { createFinalObligations } from "./settlements";

const criterionResultValidator = v.object({
  criterionId: v.id("rfsCriteria"),
  result: v.union(v.literal("passed"), v.literal("failed"), v.literal("not_run")),
  artifactIds: v.array(v.id("evidenceArtifacts")),
});

const activeCluster = async (ctx: QueryCtx | MutationCtx, principalId: string) => {
  const memberships = await ctx.db.query("identityClusterMemberships").withIndex("by_principal", (query) => query.eq("principalId", principalId)).collect();
  return memberships.find((item) => item.activeUntil === undefined)?.clusterId ?? null;
};

const reviewerEligibility = async (
  ctx: QueryCtx | MutationCtx,
  args: { rfs: Doc<"rfs">; principalId: string; clusterId: Id<"identityClusters"> },
) => {
  const authorCluster = args.rfs.claimantUserId ? await activeCluster(ctx, args.rfs.claimantUserId) : null;
  if (authorCluster === args.clusterId) return { eligible: false, role: "conflict" as const };
  if (args.rfs.authorUserId === args.principalId) return { eligible: true, role: "requester" as const };
  const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfs._id)).collect();
  if (contributions.some((item) => item.status === "accepted" && item.backerUserId === args.principalId)) return { eligible: true, role: "backer" as const };
  const assignments = await ctx.db.query("reviewAssignments").withIndex("by_reviewer_and_state", (query) => query.eq("reviewerPrincipalId", args.principalId)).collect();
  if (assignments.some((item) => item.rfsId === args.rfs._id && item.state === "accepted")) return { eligible: true, role: "trusted_reviewer" as const };
  return { eligible: false, role: "none" as const };
};

const trustForResults = async (
  ctx: QueryCtx | MutationCtx,
  principalId: string,
  criteria: Doc<"rfsCriteria">[],
) => {
  let weighted = 0;
  let total = 0;
  for (const criterion of criteria) {
    const tags = criterion.tags.length > 0 ? criterion.tags : ["general"];
    let criterionTrust = 0;
    for (const tag of tags) {
      const snapshot = await ctx.db.query("reviewerTrustSnapshots").withIndex("by_principal_and_tag", (query) => query.eq("principalId", principalId).eq("tag", tag)).unique();
      criterionTrust += snapshot?.trustBps ?? 5_000;
    }
    weighted += Math.floor(criterionTrust / tags.length) * criterion.weightBps;
    total += criterion.weightBps;
  }
  return total ? Math.floor(weighted / total) : 5_000;
};

const openReviewAssignment = async (
  ctx: MutationCtx,
  args: { rfs: Doc<"rfs">; assessment: Doc<"payoutAssessments">; reason: Doc<"reviewAssignments">["reason"] },
) => {
  const existing = await ctx.db.query("reviewAssignments").withIndex("by_assessment", (query) => query.eq("assessmentId", args.assessment._id)).collect();
  const active = existing.find((item) => item.reason === args.reason && (item.state === "open" || item.state === "accepted"));
  if (active) return active._id;
  const reserve = args.rfs.reviewReserveBaseUnits ?? BigInt(0);
  const fee = nextReviewAssignmentFee(reserve, existing);
  return await ctx.db.insert("reviewAssignments", {
    rfsId: args.rfs._id,
    assessmentId: args.assessment._id,
    reason: args.reason,
    tags: args.rfs.tags,
    dueAt: Date.now() + POLICY_V2.insufficientEvidenceExtensionMs,
    reserveFeeBaseUnits: fee,
    state: "open",
    createdAt: Date.now(),
  });
};

const openDispute = async (
  ctx: MutationCtx,
  args: { rfs: Doc<"rfs">; assessment: Doc<"payoutAssessments">; triggerType: Doc<"disputes">["triggerType"]; openedBy: string; evaluationId?: Id<"evaluationEvents">; stickyHold: boolean },
) => {
  const existing = await ctx.db.query("disputes").withIndex("by_rfs_and_state", (query) => query.eq("rfsId", args.rfs._id)).collect();
  const active = existing.find((item) => item.state !== "resolved");
  if (active) return active._id;
  const disputeId = await ctx.db.insert("disputes", {
    rfsId: args.rfs._id,
    assessmentId: args.assessment._id,
    triggerType: args.triggerType,
    triggeringEvaluationId: args.evaluationId,
    openedByPrincipalId: args.openedBy,
    state: "open",
    stickyHold: args.stickyHold,
    dueAt: Date.now() + POLICY_V2.humanDisputeSloMs,
    createdAt: Date.now(),
  });
  await ctx.db.insert("disputeEvents", { disputeId, actorPrincipalId: args.openedBy, eventType: "opened", nextState: "open", evidenceArtifactIds: [], rationale: args.triggerType, occurredAt: Date.now() });
  return disputeId;
};

export const submit = mutation({
  args: {
    rfsId: v.id("rfs"),
    skillVersionId: v.id("skillVersions"),
    targetEnvironment: v.string(),
    criterionResults: v.array(criterionResultValidator),
    narrativeRating: v.optional(v.number()),
    reviewText: v.string(),
    harmful: v.boolean(),
  },
  returns: v.object({ evaluationId: v.id("evaluationEvents"), relevantTagTrustBps: v.number(), harmfulHold: v.boolean() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const [rfs, version] = await Promise.all([ctx.db.get(args.rfsId), ctx.db.get(args.skillVersionId)]);
    if (!rfs || !version || rfs.policyVersion !== POLICY_V2.version || version.rfsId !== rfs._id || version.status !== "evaluation_open") throw new ConvexError({ code: "INVALID_STATE", message: "Evaluation workspace is unavailable." });
    const clusterId = await getOrCreatePrincipalCluster(ctx, principal.principalId);
    const eligibility = await reviewerEligibility(ctx, { rfs, principalId: principal.principalId, clusterId });
    if (!eligibility.eligible) throw new ConvexError({ code: "REVIEWER_INELIGIBLE", message: "Reviewer is not an eligible requester, backer, or assigned trusted reviewer." });
    const active = await ctx.db.query("evaluationEvents").withIndex("by_skillVersionId", (query) => query.eq("skillVersionId", version._id)).collect();
    if (active.some((item) => item.active !== false && item.identityClusterId === clusterId)) throw new ConvexError({ code: "DUPLICATE_CLUSTER_REVIEW", message: "This identity cluster already has an active evaluation for the version." });
    const criteria = rfs.currentRevisionId ? await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect() : [];
    const criteriaById = new Map(criteria.map((item) => [String(item._id), item]));
    const seen = new Set<string>();
    for (const result of args.criterionResults) {
      const criterion = criteriaById.get(String(result.criterionId));
      if (!criterion || seen.has(String(result.criterionId))) throw new ConvexError({ code: "INVALID_CRITERION_RESULT", message: "Criterion result is duplicated or outside the active contract." });
      seen.add(String(result.criterionId));
      for (const artifactId of result.artifactIds) {
        const artifact = await ctx.db.get(artifactId);
        if (!artifact || artifact.rfsId !== rfs._id || artifact.skillVersionId !== version._id || artifact.criterionId !== result.criterionId) throw new ConvexError({ code: "INVALID_EVIDENCE_SCOPE", message: "Evidence is not bound to this criterion and exact version." });
      }
    }
    const addressedCriteria = criteria.filter((criterion) => seen.has(String(criterion._id)));
    const relevantTagTrustBps = await trustForResults(ctx, principal.principalId, addressedCriteria);
    const keyAuthorization = await ctx.db.query("apiKeyAuthorizations").withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", principal.sessionId)).unique();
    const now = Date.now();
    const evaluationId = await ctx.db.insert("evaluationEvents", {
      skillId: version.skillId, skillVersionId: version._id, skillVersion: version.version,
      contentHash: version.contentHash, rfsId: rfs._id, reviewerIdentityId: principal.principalId,
      reviewerType: eligibility.role === "trusted_reviewer" ? "platform_evaluator" : keyAuthorization ? "agent" : "human",
      targetEnvironment: args.targetEnvironment.trim(), vulnerabilityTags: [...new Set(addressedCriteria.flatMap((item) => item.tags))],
      rating: args.narrativeRating && args.narrativeRating >= 1 && args.narrativeRating <= 5 ? Math.floor(args.narrativeRating) : 0,
      outcome: args.harmful ? "harmful" : args.criterionResults.some((item) => item.result === "passed") ? "improved" : "no_effect",
      confidence: "low", evidenceType: args.criterionResults.some((item) => item.artifactIds.length > 0) ? "test_result" : "freeform",
      evidenceSummary: args.criterionResults.some((item) => item.artifactIds.length > 0) ? "Cryptographically bound criterion evidence submitted." : "Narrative review only.",
      evidenceReferences: args.criterionResults.flatMap((item) => item.artifactIds.map(String)), reviewText: args.reviewText.trim(),
      weightBps: 0, payoutImpact: "none", createdAt: now, policyVersion: POLICY_V2.version,
      phase: "payout_window", principalId: principal.principalId, identityClusterId: clusterId,
      relevantTagTrustBps, active: true,
    });
    let anyVerifiedArtifact = false;
    for (const result of args.criterionResults) {
      const artifacts = await Promise.all(result.artifactIds.map(async (id) => await ctx.db.get(id)));
      const verified = artifacts.length > 0 && artifacts.every((artifact) => artifact?.verificationState === "verified" && artifact.scanState === "clean");
      anyVerifiedArtifact ||= verified;
      await ctx.db.insert("evaluationCriterionResults", { evaluationId, criterionId: result.criterionId, result: result.result, artifactIds: result.artifactIds, verifierState: verified ? "verified" : "submitted", createdAt: now });
    }
    const hold = args.harmful && anyVerifiedArtifact && relevantTagTrustBps >= POLICY_V2.harmfulHoldTrustBps;
    if (hold) {
      const assessment = await ctx.db.query("payoutAssessments").withIndex("by_skill_version", (query) => query.eq("skillId", version.skillId).eq("skillVersion", version.version)).unique();
      if (!assessment) throw new ConvexError({ code: "INVALID_STATE", message: "Payout assessment not found." });
      await ctx.db.patch(assessment._id, { workflowStatus: "human_review", status: "disputed", assessmentReason: "verified_harmful_hold", resourceVersion: (assessment.resourceVersion ?? 1) + 1 });
      await ctx.db.patch(version._id, { quarantineState: "held", status: "disputed" });
      await ctx.db.patch(version.skillId, { quarantineState: "held", status: "disputed" });
      await ctx.db.patch(rfs._id, { status: "disputed", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
      await openDispute(ctx, { rfs, assessment, triggerType: "harmful_hold", openedBy: principal.principalId, evaluationId, stickyHold: true });
      await openReviewAssignment(ctx, { rfs, assessment, reason: "harmful_hold" });
    }
    return { evaluationId, relevantTagTrustBps, harmfulHold: hold };
  },
});

export const supersede = mutation({
  args: { evaluationId: v.id("evaluationEvents"), criterionResults: v.array(criterionResultValidator), reviewText: v.string(), harmful: v.boolean() },
  returns: v.id("evaluationEvents"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const previous = await ctx.db.get(args.evaluationId);
    if (!previous || previous.principalId !== principal.principalId || previous.active === false || previous.phase !== "payout_window") throw new ConvexError({ code: "INVALID_STATE", message: "Active evaluation not found." });
    const version = await ctx.db.get(previous.skillVersionId);
    if (!version || version.evaluationDeadline <= Date.now()) throw new ConvexError({ code: "EVALUATION_CLOSED", message: "Evaluation correction window is closed." });
    await ctx.db.patch(previous._id, { active: false });
    const rfs = await ctx.db.get(previous.rfsId);
    if (!rfs) throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    const { _id: previousId, _creationTime: previousCreationTime, ...previousFields } = previous;
    void previousCreationTime;
    const nextId = await ctx.db.insert("evaluationEvents", { ...previousFields, supersedesEvaluationId: previousId, active: true, reviewText: args.reviewText.trim(), outcome: args.harmful ? "harmful" : args.criterionResults.some((item) => item.result === "passed") ? "improved" : "no_effect", evidenceReferences: args.criterionResults.flatMap((item) => item.artifactIds.map(String)), createdAt: Date.now() });
    for (const result of args.criterionResults) {
      const artifacts = await Promise.all(result.artifactIds.map(async (id) => await ctx.db.get(id)));
      const verified = artifacts.length > 0 && artifacts.every((artifact) => artifact?.verificationState === "verified" && artifact.scanState === "clean");
      await ctx.db.insert("evaluationCriterionResults", { evaluationId: nextId, criterionId: result.criterionId, result: result.result, artifactIds: result.artifactIds, verifierState: verified ? "verified" : "submitted", createdAt: Date.now() });
    }
    return nextId;
  },
});

const contractCriteria = (criteria: Doc<"rfsCriteria">[]): ContractCriterion[] => criteria.map((criterion) => ({
  id: String(criterion._id), title: criterion.title,
  passCondition: { kind: "boolean_assertion", assertion: criterion.passCondition },
  verificationMethod: criterion.verificationMethod, weightBps: criterion.weightBps,
  tags: criterion.tags, requiredForPublication: criterion.requiredForPublication,
}));

const grantBackerAccess = async (
  ctx: MutationCtx,
  rfs: Doc<"rfs">,
  skillVersion: Doc<"skillVersions">,
) => {
  const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
  for (const principalId of new Set(contributions.filter((item) => item.status === "accepted").map((item) => item.backerUserId))) {
    const grants = await ctx.db.query("accessGrants").withIndex("by_user_skill", (query) => query.eq("userId", principalId).eq("skillId", skillVersion.skillId)).collect();
    if (!grants.some((grant) => grant.active !== false && grant.skillVersionId === skillVersion._id)) {
      await ctx.db.insert("accessGrants", { userId: principalId, principalId, skillId: skillVersion.skillId, skillVersionId: skillVersion._id, source: "backer_unlock", active: true });
    }
  }
};

const loadSignals = async (ctx: MutationCtx, versionId: Id<"skillVersions">) => {
  const evaluations = (await ctx.db.query("evaluationEvents").withIndex("by_skillVersionId", (query) => query.eq("skillVersionId", versionId)).collect()).filter((item) => item.active !== false && item.phase === "payout_window" && item.identityClusterId);
  const result = [];
  for (const evaluation of evaluations) {
    const rows = await ctx.db.query("evaluationCriterionResults").withIndex("by_evaluation", (query) => query.eq("evaluationId", evaluation._id)).collect();
    result.push({ evaluation, signal: {
      clusterId: String(evaluation.identityClusterId!), relevantTagTrustBps: evaluation.relevantTagTrustBps ?? 5_000,
      eligible: true, freeform: evaluation.evidenceType === "freeform",
      machineVerifiedProof: rows.some((row) => row.verifierState === "verified"), harmful: evaluation.outcome === "harmful",
      criterionResults: Object.fromEntries(rows.map((row) => [String(row.criterionId), row.result])),
    } satisfies EvaluationSignal, rows });
  }
  return result;
};

export const closeDueEvaluation = internalMutation({
  args: { skillVersionId: v.id("skillVersions"), now: v.optional(v.number()) },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const version = await ctx.db.get(args.skillVersionId);
    if (!version || version.policyVersion !== POLICY_V2.version || (version.status !== "evaluation_open" && version.status !== "disputed")) return { state: "unchanged" };
    if (version.evaluationDeadline > now && version.status !== "disputed") return { state: "not_due" };
    const [rfs, assessment] = await Promise.all([
      ctx.db.get(version.rfsId),
      ctx.db.query("payoutAssessments").withIndex("by_skill_version", (query) => query.eq("skillId", version.skillId).eq("skillVersion", version.version)).unique(),
    ]);
    if (!rfs || !assessment || !rfs.currentRevisionId) throw new ConvexError({ code: "INVALID_STATE", message: "Evaluation contract is incomplete." });
    const criteria = await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect();
    const loaded = await loadSignals(ctx, version._id);
    const signals = loaded.map((item) => item.signal);
    const hold = harmfulHold(signals);
    if (hold.hold) {
      await ctx.db.patch(assessment._id, { workflowStatus: "human_review", status: "disputed", assessmentReason: "verified_harmful_hold" });
      await openDispute(ctx, { rfs, assessment, triggerType: "harmful_hold", openedBy: loaded.find((item) => item.signal.clusterId === hold.clusterId)?.evaluation.principalId ?? "system:evaluation", stickyHold: true });
      await openReviewAssignment(ctx, { rfs, assessment, reason: "harmful_hold" });
      return { state: "harmful_hold" };
    }
    const acceptance = acceptanceQuorum({ signals, requiredCriterionIds: criteria.filter((item) => item.requiredForPublication).map((item) => String(item._id)) });
    const results: Record<string, CriterionResult> = {};
    for (const criterion of criteria) {
      const failedSignals = signals.filter((signal) => signal.criterionResults[String(criterion._id)] === "failed");
      const failed = reductionQuorum(failedSignals).reductionSatisfied;
      const passed = signals.some((signal) => signal.machineVerifiedProof && signal.criterionResults[String(criterion._id)] === "passed");
      results[String(criterion._id)] = failed ? "failed" : passed ? "passed" : "not_run";
    }
    const requiredFailure = criteria.some((item) => item.requiredForPublication && results[String(item._id)] !== "passed");
    const reductionEstablished = Object.values(results).includes("failed");
    if ((!acceptance.satisfied && !reductionEstablished) || (requiredFailure && !reductionEstablished)) {
      if (assessment.assessmentReason !== "insufficient_evidence_extension") {
        await ctx.db.patch(version._id, { evaluationDeadline: now + POLICY_V2.insufficientEvidenceExtensionMs });
        await ctx.db.patch(assessment._id, { assessmentReason: "insufficient_evidence_extension" });
        await openReviewAssignment(ctx, { rfs, assessment, reason: "insufficient_evidence" });
        return { state: "extended" };
      }
      await ctx.db.patch(assessment._id, { workflowStatus: "held", assessmentReason: "insufficient_evidence_held" });
      await openReviewAssignment(ctx, { rfs, assessment, reason: "insufficient_evidence" });
      return { state: "held" };
    }
    if (rfs.humanReviewRequired) {
      await ctx.db.patch(assessment._id, { workflowStatus: "human_review", status: "disputed", assessmentReason: "high_value_human_review" });
      await openDispute(ctx, { rfs, assessment, triggerType: "high_value", openedBy: "system:evaluation", stickyHold: false });
      await openReviewAssignment(ctx, { rfs, assessment, reason: "high_value" });
      return { state: "human_review" };
    }
    const decision = calculateCriterionDecision({ workEscrow: baseUnits(rfs.workEscrowBaseUnits ?? BigInt(0)), criteria: contractCriteria(criteria), results, revisionStage: version.version === 1 ? "first_version" : "revised", harmful: false });
    if (decision.revisionOffered && version.version === 1) {
      await ctx.db.patch(version._id, { status: "revision_requested" });
      await ctx.db.patch(version.skillId, { status: "revision_requested" });
      await ctx.db.patch(rfs._id, { status: "revision_requested", revisionDeadline: now + POLICY_V2.revisionWindowMs, resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
      await ctx.db.patch(assessment._id, { workflowStatus: "finalized", decisionKind: "partial", passedWeightBps: decision.passedWeightBps, qualityMultiplierBps: decision.multiplierBps, assessmentReason: "revision_requested", evaluationWindowClosedAt: now, decidedAt: now });
      return { state: "revision_requested" };
    }
    await createFinalObligations(ctx, { assessment, rfs, finalMultiplierBps: decision.multiplierBps, decisionKind: decision.multiplierBps === 10_000 ? "accepted" : decision.multiplierBps === 0 ? "rejected" : "partial", decisionReference: `criterion_decision:${String(assessment._id)}` });
    await emitFinalRfsReputation(ctx, { assessment, rfs, skillVersion: version, criteria, results, decisionKind: decision.multiplierBps === 10_000 ? "accepted" : decision.multiplierBps === 0 ? "rejected" : "partial" });
    if (decision.publicationAllowed) await grantBackerAccess(ctx, rfs, version);
    await ctx.db.patch(version._id, { status: decision.publicationAllowed ? "published" : "rejected", acceptedAt: decision.multiplierBps > 0 ? now : undefined, publishedAt: decision.publicationAllowed ? now : undefined });
    await ctx.db.patch(version.skillId, { status: decision.publicationAllowed ? "published" : "rejected", publishedVersionId: decision.publicationAllowed ? version._id : undefined });
    await ctx.db.patch(rfs._id, { status: decision.publicationAllowed ? "published" : "rejected", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    return { state: "finalized" };
  },
});

export const acceptReviewAssignment = mutation({
  args: { assignmentId: v.id("reviewAssignments"), conflictDeclared: v.boolean() },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.state !== "open" || assignment.dueAt <= Date.now()) throw new ConvexError({ code: "INVALID_STATE", message: "Review assignment is unavailable." });
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "trusted_reviewer", requiredTags: assignment.tags });
    if (args.conflictDeclared) {
      await ctx.db.patch(assignment._id, { reviewerPrincipalId: principal.principalId, state: "declined", conflictDeclared: true });
      return { state: "declined" };
    }
    const rfs = await ctx.db.get(assignment.rfsId);
    const reviewerCluster = await activeCluster(ctx, principal.principalId);
    const authorCluster = rfs?.claimantUserId ? await activeCluster(ctx, rfs.claimantUserId) : null;
    if (reviewerCluster && reviewerCluster === authorCluster) throw new ConvexError({ code: "REVIEWER_CONFLICT", message: "Reviewer shares the author's identity cluster." });
    await ctx.db.patch(assignment._id, { reviewerPrincipalId: principal.principalId, state: "accepted", conflictDeclared: false, acceptedAt: Date.now() });
    return { state: "accepted" };
  },
});

export const completeReviewAssignment = mutation({
  args: { assignmentId: v.id("reviewAssignments") },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.reviewerPrincipalId !== principal.principalId || assignment.state !== "accepted") throw new ConvexError({ code: "INVALID_STATE", message: "Accepted review assignment not found." });
    const assessment = await ctx.db.get(assignment.assessmentId);
    if (!assessment) throw new ConvexError({ code: "NOT_FOUND", message: "Assessment not found." });
    const evaluations = await ctx.db.query("evaluationEvents").withIndex("by_skillVersionId", (query) => query.eq("skillVersionId", assessment.skillVersionId)).collect();
    const own = evaluations.filter((item) => item.principalId === principal.principalId && item.active !== false);
    const rows = (await Promise.all(own.map(async (item) => await ctx.db.query("evaluationCriterionResults").withIndex("by_evaluation", (query) => query.eq("evaluationId", item._id)).collect()))).flat();
    if (rows.length === 0 || rows.some((row) => row.verifierState !== "verified")) throw new ConvexError({ code: "VERIFIED_EVIDENCE_REQUIRED", message: "Assignment completion requires independently verified criterion evidence." });
    await ctx.db.patch(assignment._id, { state: "completed", completedAt: Date.now() });
    return { state: "completed" };
  },
});

export const listReviewAssignments = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "trusted_reviewer" });
    const assigned = await ctx.db.query("reviewAssignments").withIndex("by_reviewer_and_state", (query) => query.eq("reviewerPrincipalId", principal.principalId)).collect();
    const open = await ctx.db.query("reviewAssignments").withIndex("by_state_and_dueAt", (query) => query.eq("state", "open")).collect();
    return await Promise.all(
      [...assigned, ...open].map(async (assignment) => {
        const rfs = await ctx.db.get(assignment.rfsId);
        return {
          ...assignment,
          rfsTitle: rfs?.title ?? "Request unavailable",
        };
      }),
    );
  },
});

export const getReviewAssignment = query({
  args: { assignmentId: v.id("reviewAssignments") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "trusted_reviewer", requiredTags: assignment.tags });
    if (assignment.reviewerPrincipalId && assignment.reviewerPrincipalId !== principal.principalId) return null;
    const [rfs, assessment] = await Promise.all([ctx.db.get(assignment.rfsId), ctx.db.get(assignment.assessmentId)]);
    if (!rfs || !assessment || !rfs.currentRevisionId) return null;
    const [revision, criteria, version, evidence] = await Promise.all([
      ctx.db.get(rfs.currentRevisionId),
      ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect(),
      ctx.db.get(assessment.skillVersionId),
      ctx.db.query("evidenceArtifacts").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect(),
    ]);
    return {
      assignment: { assignmentId: assignment._id, reason: assignment.reason, tags: assignment.tags, dueAt: assignment.dueAt, reserveFeeBaseUnits: assignment.reserveFeeBaseUnits, state: assignment.state, conflictDeclared: assignment.conflictDeclared ?? false },
      rfs: { rfsId: rfs._id, title: rfs.title, description: rfs.description, scope: rfs.scope, targetEnvironments: revision?.targetEnvironments ?? [], contractDigest: rfs.contractDigest, status: rfs.status },
      revision: revision ? { revisionId: revision._id, revisionNumber: revision.revisionNumber, contractDigest: revision.contractDigest } : null,
      criteria: criteria.map((criterion) => ({ criterionId: criterion._id, criterionKey: criterion.criterionKey, title: criterion.title, passConditionKind: criterion.passConditionKind, passCondition: criterion.passCondition, verificationMethod: criterion.verificationMethod, weightBps: criterion.weightBps, requiredForPublication: criterion.requiredForPublication })),
      skillVersion: version ? { skillVersionId: version._id, version: version.version, contentHash: version.contentHash, summary: version.summary, status: version.status, quarantineState: version.quarantineState } : null,
      evidence: evidence.filter((artifact) => !artifact.deletedAt).map((artifact) => ({ artifactId: artifact._id, criterionId: artifact.criterionId, classification: artifact.classification, publicRedaction: artifact.publicRedaction, plaintextSha256: artifact.plaintextSha256, verificationState: artifact.verificationState, scanState: artifact.scanState, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, downloadHref: `/api/v2/evidence/${String(artifact._id)}/download` })),
    };
  },
});

export const listAdjudicationQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const [open, assigned] = await Promise.all([
      ctx.db.query("disputes").withIndex("by_state_and_dueAt", (query) => query.eq("state", "open")).collect(),
      ctx.db.query("disputes").withIndex("by_assignedPrincipal_and_state", (query) => query.eq("assignedPrincipalId", principal.principalId).eq("state", "assigned")).collect(),
    ]);
    return await Promise.all([...open, ...assigned].map(async (dispute) => {
      const rfs = await ctx.db.get(dispute.rfsId);
      const criteria = rfs?.currentRevisionId ? await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect() : [];
      const events = await ctx.db.query("disputeEvents").withIndex("by_dispute", (query) => query.eq("disputeId", dispute._id)).collect();
      return { disputeId: dispute._id, rfsId: dispute.rfsId, rfsTitle: rfs?.title ?? "Unavailable RFS", triggerType: dispute.triggerType, state: dispute.state, dueAt: dispute.dueAt, stickyHold: dispute.stickyHold, criteria: criteria.map((criterion) => ({ criterionId: criterion._id, title: criterion.title, weightBps: criterion.weightBps, passCondition: criterion.passCondition })), evidence: events.flatMap((event) => event.evidenceArtifactIds.map((artifactId) => ({ artifactId, publicRedaction: event.publicRedaction ?? "Evidence supplied for adjudication." }))) };
    }));
  },
});

export const claimDispute = mutation({
  args: { disputeId: v.id("disputes") },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, principal);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute || dispute.state !== "open") throw new ConvexError({ code: "INVALID_STATE", message: "Dispute is unavailable." });
    const reporterCluster = await activeCluster(ctx, dispute.openedByPrincipalId);
    const adjudicatorCluster = await activeCluster(ctx, principal.principalId);
    if (reporterCluster && reporterCluster === adjudicatorCluster) throw new ConvexError({ code: "ADJUDICATOR_CONFLICT", message: "The triggering reporter cannot adjudicate this dispute." });
    await ctx.db.patch(dispute._id, { state: "assigned", assignedPrincipalId: principal.principalId });
    await ctx.db.insert("disputeEvents", { disputeId: dispute._id, actorPrincipalId: principal.principalId, eventType: "assigned", priorState: "open", nextState: "assigned", evidenceArtifactIds: [], rationale: "independent adjudicator accepted", occurredAt: Date.now() });
    return { state: "assigned" };
  },
});

const resolutionValidator = v.union(v.literal("clear_hold"), v.literal("request_revision"), v.literal("accept_partial"), v.literal("block_harmful"), v.literal("reject_fraud"), v.literal("confirm_abandonment"), v.literal("insufficient_evidence"));

export const resolveDispute = mutation({
  args: { disputeId: v.id("disputes"), resolution: resolutionValidator, criterionResults: v.array(v.object({ criterionId: v.id("rfsCriteria"), result: v.union(v.literal("passed"), v.literal("failed"), v.literal("not_run")) })), rationale: v.string(), publicRedaction: v.string(), conflictDeclared: v.boolean() },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, principal);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute || dispute.state !== "assigned" || dispute.assignedPrincipalId !== principal.principalId || args.conflictDeclared) throw new ConvexError({ code: "INVALID_STATE", message: "Independent assigned adjudicator required." });
    if (!args.rationale.trim() || !args.publicRedaction.trim()) throw new ConvexError({ code: "RATIONALE_REQUIRED", message: "Private rationale and public redaction are required." });
    const [rfs, assessment] = await Promise.all([ctx.db.get(dispute.rfsId), ctx.db.get(dispute.assessmentId)]);
    if (!rfs || !assessment || !rfs.currentRevisionId) throw new ConvexError({ code: "INVALID_STATE", message: "Dispute contract is unavailable." });
    const version = await ctx.db.get(assessment.skillVersionId);
    const criteria = await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect();
    const resultMap = Object.fromEntries(args.criterionResults.map((item) => [String(item.criterionId), item.result])) as Record<string, CriterionResult>;
    if (args.resolution === "clear_hold" || args.resolution === "insufficient_evidence") {
      await ctx.db.patch(assessment._id, { workflowStatus: "evaluating", status: "pending", assessmentReason: args.resolution });
      if (version) await ctx.db.patch(version._id, { status: "evaluation_open", quarantineState: "clear", evaluationDeadline: Date.now() + POLICY_V2.insufficientEvidenceExtensionMs });
      await ctx.db.patch(rfs._id, { status: "evaluation_open" });
    } else if (args.resolution === "request_revision") {
      if (!version || version.version !== 1) throw new ConvexError({ code: "REVISION_LIMIT", message: "No further revision is allowed." });
      await ctx.db.patch(version._id, { status: "revision_requested" });
      await ctx.db.patch(version.skillId, { status: "revision_requested" });
      await ctx.db.patch(rfs._id, { status: "revision_requested", revisionDeadline: Date.now() + POLICY_V2.revisionWindowMs });
    } else {
      const harmful = args.resolution === "block_harmful" || args.resolution === "reject_fraud";
      const decision = calculateCriterionDecision({ workEscrow: baseUnits(rfs.workEscrowBaseUnits ?? BigInt(0)), criteria: contractCriteria(criteria), results: resultMap, revisionStage: version?.version === 2 ? "revised" : "first_version", harmful });
      const decisionKind = harmful ? "harmful" as const : args.resolution === "confirm_abandonment" ? "abandoned" as const : decision.multiplierBps === 10_000 ? "accepted" as const : decision.multiplierBps === 0 ? "rejected" as const : "partial" as const;
      await createFinalObligations(ctx, { assessment, rfs, finalMultiplierBps: harmful || args.resolution === "confirm_abandonment" ? 0 : decision.multiplierBps, decisionKind, decisionReference: `adjudication:${String(dispute._id)}:${args.resolution}`, bondSlashBps: harmful ? 10_000 : args.resolution === "confirm_abandonment" ? 5_000 : 0 });
      if (version) {
        await emitFinalRfsReputation(ctx, { assessment, rfs, skillVersion: version, criteria, results: resultMap, decisionKind });
        if (!harmful && args.resolution !== "confirm_abandonment" && decision.publicationAllowed) await grantBackerAccess(ctx, rfs, version);
      }
      if (version) {
        const publish = !harmful && args.resolution !== "confirm_abandonment" && decision.publicationAllowed;
        await ctx.db.patch(version._id, { status: publish ? "published" : "rejected", quarantineState: harmful ? "quarantined" : "clear", publishedAt: publish ? Date.now() : undefined });
        await ctx.db.patch(version.skillId, { status: publish ? "published" : "rejected", quarantineState: harmful ? "quarantined" : "clear", publishedVersionId: publish ? version._id : undefined });
      }
      await ctx.db.patch(rfs._id, { status: decisionKind === "accepted" || decisionKind === "partial" && decision.publicationAllowed ? "published" : "rejected" });
    }
    await ctx.db.patch(dispute._id, { state: "resolved", resolution: args.resolution, publicRationale: args.publicRedaction.trim(), resolvedAt: Date.now() });
    await ctx.db.insert("disputeEvents", { disputeId: dispute._id, actorPrincipalId: principal.principalId, eventType: "resolved", priorState: "assigned", nextState: "resolved", evidenceArtifactIds: [], resolution: args.resolution, rationale: args.rationale.trim(), publicRedaction: args.publicRedaction.trim(), occurredAt: Date.now() });
    return { state: "resolved" };
  },
});

export const getWorkspace = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) return null;
    const clusterId = await activeCluster(ctx, principal.principalId);
    if (!clusterId) return null;
    const eligible = await reviewerEligibility(ctx, { rfs, principalId: principal.principalId, clusterId });
    if (!eligible.eligible) return null;
    const skill = await ctx.db.query("skills").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).first();
    const version = skill?.publishedVersionId ? await ctx.db.get(skill.publishedVersionId) : skill ? (await ctx.db.query("skillVersions").withIndex("by_skill", (query) => query.eq("skillId", skill._id)).order("desc").first()) : null;
    const criteria = rfs.currentRevisionId ? await ctx.db.query("rfsCriteria").withIndex("by_revision", (query) => query.eq("revisionId", rfs.currentRevisionId!)).collect() : [];
    return { rfsId: rfs._id, skillVersion: version, criteria, role: eligible.role };
  },
});

export const listPublic = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("evaluationEvents").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfsId)).collect();
    return await Promise.all(rows.map(async (row) => ({
      evaluationId: row._id, skillVersionId: row.skillVersionId, reviewerRole: row.reviewerType,
      rating: row.rating || undefined, outcome: row.outcome, reviewText: row.reviewText,
      supersedesEvaluationId: row.supersedesEvaluationId, active: row.active !== false,
      createdAt: row.createdAt,
      criteria: (await ctx.db.query("evaluationCriterionResults").withIndex("by_evaluation", (query) => query.eq("evaluationId", row._id)).collect()).map((result) => ({ criterionId: result.criterionId, result: result.result, verifierState: result.verifierState, artifactIds: result.artifactIds })),
    })));
  },
});

export const listDisputes = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePrincipal(ctx);
    return await ctx.db.query("disputes").filter((query) => query.eq(query.field("rfsId"), args.rfsId)).collect();
  },
});

const assertVerifiedDisputeEvidence = async (
  ctx: MutationCtx,
  rfsId: Id<"rfs">,
  artifactIds: Id<"evidenceArtifacts">[],
) => {
  if (artifactIds.length === 0 || new Set(artifactIds.map(String)).size !== artifactIds.length) {
    throw new ConvexError({ code: "VERIFIED_EVIDENCE_REQUIRED", message: "At least one unique verified evidence artifact is required." });
  }
  const artifacts = await Promise.all(artifactIds.map(async (artifactId) => await ctx.db.get(artifactId)));
  if (artifacts.some((artifact) => !artifact || artifact.rfsId !== rfsId || artifact.verificationState !== "verified" || artifact.scanState !== "clean" || artifact.deletedAt)) {
    throw new ConvexError({ code: "INVALID_EVIDENCE_SCOPE", message: "Dispute evidence must be clean, verified, retained, and bound to this RFS." });
  }
};

const isRfsStakeholder = async (ctx: MutationCtx, rfs: Doc<"rfs">, principalId: string) => {
  if (rfs.authorUserId === principalId || rfs.claimantUserId === principalId) return true;
  const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
  return contributions.some((contribution) => contribution.status === "accepted" && contribution.backerUserId === principalId);
};

export const openAppeal = mutation({
  args: {
    rfsId: v.id("rfs"),
    evidenceArtifactIds: v.array(v.id("evidenceArtifacts")),
    rationale: v.string(),
    publicRedaction: v.string(),
  },
  returns: v.id("disputes"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version) throw new ConvexError({ code: "NOT_FOUND", message: "Policy-v2 RFS not found." });
    if (!(await isRfsStakeholder(ctx, rfs, principal.principalId))) throw new ConvexError({ code: "FORBIDDEN", message: "Only the requester, selected author, or a funding backer may appeal." });
    if (!args.rationale.trim() || !args.publicRedaction.trim()) throw new ConvexError({ code: "REDACTION_REQUIRED", message: "Private rationale and a public redaction are required." });
    await assertVerifiedDisputeEvidence(ctx, rfs._id, args.evidenceArtifactIds);
    const assessment = await ctx.db.query("payoutAssessments").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).unique();
    if (!assessment || assessment.status === "claimed" || assessment.workflowStatus === "finalized") throw new ConvexError({ code: "INVALID_STATE", message: "The current payout is no longer appealable." });
    const active = (await ctx.db.query("disputes").withIndex("by_rfs_and_state", (query) => query.eq("rfsId", rfs._id)).collect()).find((dispute) => dispute.state !== "resolved");
    if (active) throw new ConvexError({ code: "CONFLICT", message: "An active dispute already holds this RFS." });
    const disputeId = await ctx.db.insert("disputes", {
      rfsId: rfs._id,
      assessmentId: assessment._id,
      triggerType: "appeal",
      openedByPrincipalId: principal.principalId,
      state: "open",
      stickyHold: true,
      dueAt: Date.now() + POLICY_V2.humanDisputeSloMs,
      createdAt: Date.now(),
    });
    await ctx.db.patch(assessment._id, {
      status: "disputed",
      workflowStatus: "human_review",
      assessmentReason: "stakeholder_appeal",
      resourceVersion: (assessment.resourceVersion ?? 1) + 1,
    });
    await ctx.db.patch(rfs._id, { status: "disputed", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    const [skill, version] = await Promise.all([ctx.db.get(assessment.skillId), ctx.db.get(assessment.skillVersionId)]);
    if (skill) await ctx.db.patch(skill._id, { quarantineState: "held", status: "disputed" });
    if (version) await ctx.db.patch(version._id, { quarantineState: "held", status: "disputed" });
    await ctx.db.insert("disputeEvents", {
      disputeId,
      actorPrincipalId: principal.principalId,
      eventType: "opened",
      nextState: "open",
      evidenceArtifactIds: args.evidenceArtifactIds,
      rationale: args.rationale.trim(),
      publicRedaction: args.publicRedaction.trim(),
      occurredAt: Date.now(),
    });
    await openReviewAssignment(ctx, { rfs, assessment, reason: "appeal" });
    return disputeId;
  },
});

export const appendDisputeEvidence = mutation({
  args: {
    disputeId: v.id("disputes"),
    evidenceArtifactIds: v.array(v.id("evidenceArtifacts")),
    rationale: v.string(),
    publicRedaction: v.string(),
  },
  returns: v.id("disputeEvents"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute || dispute.state === "resolved") throw new ConvexError({ code: "INVALID_STATE", message: "Active dispute not found." });
    const rfs = await ctx.db.get(dispute.rfsId);
    if (!rfs) throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    const stakeholder = await isRfsStakeholder(ctx, rfs, principal.principalId);
    if (!stakeholder && dispute.assignedPrincipalId !== principal.principalId) throw new ConvexError({ code: "FORBIDDEN", message: "Only a stakeholder or assigned adjudicator may add evidence." });
    if (!args.rationale.trim() || !args.publicRedaction.trim()) throw new ConvexError({ code: "REDACTION_REQUIRED", message: "Private rationale and a public redaction are required." });
    await assertVerifiedDisputeEvidence(ctx, rfs._id, args.evidenceArtifactIds);
    return await ctx.db.insert("disputeEvents", {
      disputeId: dispute._id,
      actorPrincipalId: principal.principalId,
      eventType: "evidence_added",
      priorState: dispute.state,
      nextState: dispute.state,
      evidenceArtifactIds: args.evidenceArtifactIds,
      rationale: args.rationale.trim(),
      publicRedaction: args.publicRedaction.trim(),
      occurredAt: Date.now(),
    });
  },
});

export const listEvents = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const [assessment, disputes] = await Promise.all([
      ctx.db.query("assessmentEvents").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfsId)).collect(),
      ctx.db.query("disputes").filter((query) => query.eq(query.field("rfsId"), args.rfsId)).collect(),
    ]);
    const disputeEvents = (await Promise.all(disputes.map(async (dispute) => await ctx.db.query("disputeEvents").withIndex("by_dispute", (query) => query.eq("disputeId", dispute._id)).collect()))).flat();
    return [...assessment.map((event) => ({ type: "assessment", occurredAt: event.occurredAt, state: event.nextState, reason: event.reason })), ...disputeEvents.map((event) => ({ type: "dispute", occurredAt: event.occurredAt, state: event.nextState, reason: event.publicRedaction ?? event.eventType }))].sort((left, right) => left.occurredAt - right.occurredAt);
  },
});
