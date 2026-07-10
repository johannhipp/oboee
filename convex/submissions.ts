import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { sha256Digest } from "./lib/contracts";
import { cleanTags } from "./lib/helpers";
import { POLICY_V2 } from "./lib/policy";
import { requirePrincipal } from "./lib/principals";

export const submit = mutation({
  args: {
    rfsId: v.id("rfs"),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    purchasePriceBaseUnits: v.int64(),
  },
  returns: v.object({
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    assessmentId: v.id("payoutAssessments"),
    version: v.number(),
    contentSha256: v.string(),
    evaluationDeadline: v.number(),
  }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version || rfs.claimantUserId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Assigned policy-v2 RFS not found." });
    }
    if (rfs.status !== "assigned" && rfs.status !== "revision_requested") {
      throw new ConvexError({ code: "INVALID_STATE", message: "The RFS is not accepting a submission." });
    }
    if (rfs.deliveryDeadline && rfs.deliveryDeadline < Date.now()) {
      throw new ConvexError({ code: "DELIVERY_DEADLINE_PASSED", message: "The delivery deadline has passed and requires human review." });
    }
    const contentMarkdown = args.contentMarkdown.trim();
    const summary = args.summary.trim();
    const tags = cleanTags(args.tags);
    if (!contentMarkdown || !summary || tags.length === 0 || args.purchasePriceBaseUnits <= BigInt(0)) {
      throw new ConvexError({ code: "INVALID_SUBMISSION", message: "Content, summary, tags, and a positive purchase price are required." });
    }
    const existingSkill = await ctx.db.query("skills").withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id)).unique();
    const existingVersions = existingSkill
      ? await ctx.db.query("skillVersions").withIndex("by_skill", (query) => query.eq("skillId", existingSkill._id)).collect()
      : [];
    const version = existingVersions.length + 1;
    if (version > 2 || (version === 2 && rfs.status !== "revision_requested")) {
      throw new ConvexError({ code: "REVISION_LIMIT", message: "Only one contract revision is permitted." });
    }
    const contentSha256 = sha256Digest({
      rfsId: String(rfs._id),
      version,
      contentMarkdown,
      summary,
      tags,
      purchasePriceBaseUnits: args.purchasePriceBaseUnits.toString(),
      contractDigest: rfs.contractDigest,
    });
    const now = Date.now();
    const evaluationDeadline = now + POLICY_V2.evaluationWindowMs[rfs.riskTier ?? "low"];
    const skillId = existingSkill?._id ?? await ctx.db.insert("skills", {
      rfsId: rfs._id,
      authorUserId: principal.principalId,
      contentMarkdown: "",
      summary,
      tags,
      purchasePriceBaseUnits: args.purchasePriceBaseUnits,
      status: "evaluation_open",
      policyVersion: POLICY_V2.version,
      quarantineState: "clear",
    });
    if (existingSkill) {
      await ctx.db.patch(existingSkill._id, {
        summary,
        tags,
        purchasePriceBaseUnits: args.purchasePriceBaseUnits,
        status: "evaluation_open",
        latestVersion: version,
        latestContentHash: contentSha256,
      });
    }
    const skillVersionId = await ctx.db.insert("skillVersions", {
      skillId,
      rfsId: rfs._id,
      version,
      contentHash: contentSha256,
      contentMarkdown,
      summary,
      tags,
      purchasePriceBaseUnits: args.purchasePriceBaseUnits,
      authorUserId: principal.principalId,
      status: "evaluation_open",
      submittedAt: now,
      evaluationDeadline,
      revisionOfVersion: version === 2 ? 1 : undefined,
      policyVersion: POLICY_V2.version,
      digestAlgorithm: "sha256",
      quarantineState: "clear",
    });
    const workEscrow = rfs.workEscrowBaseUnits ?? BigInt(0);
    const assessmentId = await ctx.db.insert("payoutAssessments", {
      rfsId: rfs._id,
      skillId,
      skillVersionId,
      skillVersion: version,
      authorUserId: principal.principalId,
      grossAmountBaseUnits: workEscrow,
      basePayoutBaseUnits: workEscrow,
      qualityMultiplierBps: 0,
      finalPayoutBaseUnits: BigInt(0),
      platformFeeBaseUnits: BigInt(0),
      unreleasedAmountBaseUnits: workEscrow,
      status: "pending",
      assessmentReason: "evaluation_open",
      evaluationWindowOpenedAt: now,
      policyVersion: POLICY_V2.version,
      workflowStatus: "evaluating",
      resourceVersion: 1,
    });
    await ctx.db.insert("assessmentEvents", {
      assessmentId,
      rfsId: rfs._id,
      actorPrincipalId: principal.principalId,
      priorState: "pending",
      nextState: "evaluating",
      reason: version === 1 ? "initial_submission" : "revision_submission",
      evidenceArtifactIds: [],
      algorithmInputJson: JSON.stringify({ skillVersionId: String(skillVersionId), contentSha256 }),
      algorithmOutputJson: JSON.stringify({ evaluationDeadline }),
      policyVersion: POLICY_V2.version,
      correlationId: `submission:${String(skillVersionId)}`,
      occurredAt: now,
    });
    await ctx.db.patch(rfs._id, {
      status: "evaluation_open",
      revisionDeadline: undefined,
      resourceVersion: (rfs.resourceVersion ?? 1) + 1,
    });
    return { skillId, skillVersionId, assessmentId, version, contentSha256, evaluationDeadline };
  },
});
