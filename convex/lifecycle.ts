import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { POLICY_V2 } from "./lib/policy";
import { transitionHumanActionOperations } from "./lib/apiOperationTransitions";
import { createFinalObligations } from "./settlements";

export const dueWork = internalQuery({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.min(100, args.limit ?? 50);
    const [rfsRows, versions, intents, humanActions] = await Promise.all([
      ctx.db.query("rfs").take(500),
      ctx.db.query("skillVersions").take(500),
      ctx.db.query("paymentIntents").withIndex("by_state_and_expiresAt").take(500),
      ctx.db.query("humanActionRequests").take(500),
    ]);
    return {
      funding: rfsRows.filter((row) => row.policyVersion === 2 && row.status === "open" && row.fundingDeadline !== undefined && row.fundingDeadline <= now).slice(0, limit).map((row) => row._id),
      applications: rfsRows.filter((row) => row.policyVersion === 2 && row.status === "funded" && row.applicationDeadline !== undefined && row.applicationDeadline <= now).slice(0, limit).map((row) => row._id),
      delivery: rfsRows.filter((row) => row.policyVersion === 2 && row.status === "assigned" && row.deliveryDeadline !== undefined && row.deliveryDeadline + 24 * 60 * 60 * 1_000 <= now).slice(0, limit).map((row) => row._id),
      revisions: rfsRows.filter((row) => row.policyVersion === 2 && row.status === "revision_requested" && row.revisionDeadline !== undefined && row.revisionDeadline <= now).slice(0, limit).map((row) => row._id),
      evaluations: versions.filter((row) => row.policyVersion === 2 && (row.status === "evaluation_open" || row.status === "disputed") && row.evaluationDeadline <= now).slice(0, limit).map((row) => row._id),
      intents: intents.filter((row) => (row.state === "reserved" || row.state === "challenged") && row.expiresAt <= now).slice(0, limit).map((row) => row._id),
      humanActions: humanActions.filter((row) => row.status === "pending" && row.expiresAt <= now).slice(0, limit).map((row) => row._id),
    };
  },
});

export const expireHumanAction = internalMutation({
  args: { actionId: v.id("humanActionRequests"), now: v.optional(v.number()) },
  returns: v.union(v.literal("expired"), v.literal("unchanged")),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const action = await ctx.db.get(args.actionId);
    if (!action || action.status !== "pending" || action.expiresAt > now) return "unchanged";
    await ctx.db.patch(action._id, { status: "expired", resolvedAt: now });
    await transitionHumanActionOperations(ctx, action._id, "expired", now);
    return "expired";
  },
});

export const flagDeliveryExpiry = internalMutation({
  args: { rfsId: v.id("rfs"), now: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== 2 || rfs.status !== "assigned" || !rfs.deliveryDeadline || rfs.deliveryDeadline + 24 * 60 * 60 * 1_000 > now || !rfs.claimantUserId) return "unchanged";
    const existing = (await ctx.db.query("humanActionRequests").withIndex("by_resource", (query) => query.eq("resourceType", "rfs").eq("resourceId", String(rfs._id))).collect()).find((item) => item.actionType === "confirm_abandonment" && item.status === "pending");
    if (existing) return "already_flagged";
    await ctx.db.insert("humanActionRequests", {
      ownerPrincipalId: rfs.authorUserId, actionType: "confirm_abandonment", resourceType: "rfs",
      resourceId: String(rfs._id), payloadDigest: rfs.contractDigest ?? String(rfs._id),
      requestedBoundsJson: JSON.stringify({ claimantPrincipalId: rfs.claimantUserId, deliveryDeadline: rfs.deliveryDeadline }),
      reason: "Delivery deadline and grace period passed; human abandonment review is required.",
      status: "pending", expiresAt: now + POLICY_V2.humanDisputeSloMs, createdAt: now,
    });
    return "human_review_required";
  },
});

export const expireRevision = internalMutation({
  args: { rfsId: v.id("rfs"), now: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== 2 || rfs.status !== "revision_requested" || !rfs.revisionDeadline || rfs.revisionDeadline > now) return "unchanged";
    const assessments = await ctx.db.query("payoutAssessments").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).collect();
    const assessment = assessments.sort((left, right) => right.skillVersion - left.skillVersion)[0];
    if (!assessment || assessment.assessmentReason !== "revision_requested") return "unchanged";
    const multiplier = Math.min(9_000, assessment.passedWeightBps ?? assessment.qualityMultiplierBps ?? 0);
    await createFinalObligations(ctx, { assessment, rfs, finalMultiplierBps: multiplier, decisionKind: multiplier > 0 ? "partial" : "rejected", decisionReference: `revision_missed:${String(assessment._id)}` });
    const version = await ctx.db.get(assessment.skillVersionId);
    if (version) {
      await ctx.db.patch(version._id, { status: "rejected" });
      await ctx.db.patch(version.skillId, { status: "rejected" });
    }
    await ctx.db.patch(rfs._id, { status: "rejected", resourceVersion: (rfs.resourceVersion ?? 1) + 1 });
    return "finalized";
  },
});

export const compareAssignmentShadow = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ compared: v.number(), diverged: v.number() }),
  handler: async (ctx, args) => {
    const rows = (await ctx.db.query("rfs").take(500)).filter((rfs) => rfs.policyVersion === POLICY_V2.version && rfs.selectedApplicationId).slice(0, Math.min(100, args.limit ?? 50));
    let compared = 0; let diverged = 0;
    for (const rfs of rows) {
      const applications = await ctx.db.query("rfsApplications").filter((query) => query.eq(query.field("rfsId"), rfs._id)).collect();
      const eligible = applications.filter((application) => application.state !== "withdrawn" && application.state !== "ineligible");
      const legacy = [...eligible].sort((left, right) => left.submittedAt - right.submittedAt || String(left._id).localeCompare(String(right._id)))[0];
      const selected = eligible.find((application) => application._id === rfs.selectedApplicationId);
      if (!legacy || !selected) continue;
      const existing = await ctx.db.query("policyShadowComparisons").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).unique();
      const value = { legacyFirstApplicationId: legacy._id, policyV2ApplicationId: selected._id, diverged: legacy._id !== selected._id, legacySubmittedAt: legacy.submittedAt, policyV2ScoreBps: selected.totalScoreBps, comparedAt: args.now ?? Date.now(), algorithmVersion: POLICY_V2.version };
      if (existing) await ctx.db.patch(existing._id, value); else await ctx.db.insert("policyShadowComparisons", { rfsId: rfs._id, ...value });
      compared += 1; if (value.diverged) diverged += 1;
    }
    return { compared, diverged };
  },
});

type DueWork = {
  funding: Id<"rfs">[];
  applications: Id<"rfs">[];
  delivery: Id<"rfs">[];
  revisions: Id<"rfs">[];
  evaluations: Id<"skillVersions">[];
  intents: Id<"paymentIntents">[];
  humanActions: Id<"humanActionRequests">[];
};

const dueRef = makeFunctionReference<"query", { now?: number; limit?: number }, DueWork>("lifecycle:dueWork");
const fundingRef = makeFunctionReference<"mutation", { rfsId: Id<"rfs">; now?: number }, string>("rfsV2:expireFunding");
const applicationsRef = makeFunctionReference<"mutation", { rfsId: Id<"rfs">; now?: number }, { state: string; selectedApplicationId?: Id<"rfsApplications"> }>("applications:closeApplications");
const deliveryRef = makeFunctionReference<"mutation", { rfsId: Id<"rfs">; now?: number }, string>("lifecycle:flagDeliveryExpiry");
const revisionRef = makeFunctionReference<"mutation", { rfsId: Id<"rfs">; now?: number }, string>("lifecycle:expireRevision");
const evaluationRef = makeFunctionReference<"mutation", { skillVersionId: Id<"skillVersions">; now?: number }, { state: string }>("evaluationV2:closeDueEvaluation");
const intentRef = makeFunctionReference<"mutation", { intentId: Id<"paymentIntents"> }, "expired" | "unchanged">("paymentIntents:expireIntent");
const humanActionRef = makeFunctionReference<"mutation", { actionId: Id<"humanActionRequests">; now?: number }, "expired" | "unchanged">("lifecycle:expireHumanAction");
const reviewRef = makeFunctionReference<"mutation", { now?: number; limit?: number }, { finalized: number }>("postUseReviews:finalizeDue");
const evidenceRef = makeFunctionReference<"mutation", { now?: number; limit?: number }, { deleted: number }>("evidence:deleteExpiredRestricted");
const reputationRef = makeFunctionReference<"mutation", { now?: number; limit?: number }, { rebuilt: number }>("reputation:rebuildSnapshots");
const discoveryRef = makeFunctionReference<"mutation", { now?: number }, { refreshed: number }>("reputation:refreshDiscovery");
const shadowRef = makeFunctionReference<"mutation", { now?: number; limit?: number }, { compared: number; diverged: number }>("lifecycle:compareAssignmentShadow");

export const reconcileDue = internalAction({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ processed: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.runQuery(dueRef, { now, limit: args.limit });
    let processed = 0;
    for (const actionId of due.humanActions) { await ctx.runMutation(humanActionRef, { actionId, now }); processed += 1; }
    for (const intentId of due.intents) { await ctx.runMutation(intentRef, { intentId }); processed += 1; }
    for (const rfsId of due.funding) { await ctx.runMutation(fundingRef, { rfsId, now }); processed += 1; }
    for (const rfsId of due.applications) { await ctx.runMutation(applicationsRef, { rfsId, now }); processed += 1; }
    for (const rfsId of due.delivery) { await ctx.runMutation(deliveryRef, { rfsId, now }); processed += 1; }
    for (const rfsId of due.revisions) { await ctx.runMutation(revisionRef, { rfsId, now }); processed += 1; }
    for (const skillVersionId of due.evaluations) { await ctx.runMutation(evaluationRef, { skillVersionId, now }); processed += 1; }
    await ctx.runMutation(reviewRef, { now, limit: args.limit });
    await ctx.runMutation(evidenceRef, { now, limit: args.limit });
    await ctx.runMutation(reputationRef, { now, limit: args.limit });
    await ctx.runMutation(discoveryRef, { now });
    await ctx.runMutation(shadowRef, { now, limit: args.limit });
    return { processed };
  },
});
