import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { ratingToScore } from "./lib/reputationPolicy";
import { POLICY_V2 } from "./lib/policy";
import { getOrCreatePrincipalCluster, requireActiveRole, requirePrincipal, requireRecentPasskey } from "./lib/principals";
import { recordPrincipalActivity } from "./lib/activity";

const DAY_MS = 24 * 60 * 60 * 1_000;
const outcomeValidator = v.union(v.literal("unable_to_apply"), v.literal("no_effect"), v.literal("improved"), v.literal("resolved"), v.literal("harmful"));

const ensureReviewInput = (rating: number, text: string) => {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !text.trim()) throw new ConvexError({ code: "INVALID_REVIEW", message: "Rating must be 1-5 and review text is required." });
};

const verifiedEvidence = async (ctx: MutationCtx, ids: Id<"evidenceArtifacts">[], principalId: string, versionId: Id<"skillVersions">) => {
  const artifacts = await Promise.all(ids.map(async (id) => await ctx.db.get(id)));
  return artifacts.length > 0 && artifacts.every((artifact) => artifact?.ownerPrincipalId === principalId && artifact.skillVersionId === versionId && artifact.verificationState === "verified" && artifact.scanState === "clean");
};

const quarantine = async (ctx: MutationCtx, review: Doc<"postUseReviews">) => {
  const skill = await ctx.db.get(review.skillId);
  const version = await ctx.db.get(review.skillVersionId);
  if (!skill || !version) return;
  const versions = await ctx.db.query("skillVersions").withIndex("by_skill", (query) => query.eq("skillId", skill._id)).collect();
  const fallback = versions.filter((item) => item._id !== version._id && item.status === "published" && (item.quarantineState ?? "clear") === "clear").sort((left, right) => right.version - left.version)[0];
  await ctx.db.patch(version._id, { quarantineState: "held" });
  await ctx.db.patch(skill._id, { quarantineState: "held", safeFallbackVersionId: fallback?._id });
  await ctx.db.insert("quarantineEvents", { skillId: skill._id, skillVersionId: version._id, triggeringReviewId: review._id, priorState: skill.quarantineState ?? "clear", nextState: "held", reason: "verified_post_use_harmful_report", publicRedaction: "A verified harmful outcome is under trusted review.", salesHeld: true, purchasePayoutsHeld: true, safeFallbackVersionId: fallback?._id, occurredAt: Date.now() });
  await recordPrincipalActivity(ctx, { principalId: skill.authorUserId, role: "author", resourceType: "skillVersion", resourceId: String(version._id), eventType: "quarantine_held", publicSummary: "A verified harmful report placed this skill version on hold." });
  await recordPrincipalActivity(ctx, { principalId: review.reviewerPrincipalId, role: "reviewer", resourceType: "postUseReview", resourceId: String(review._id), eventType: "harmful_review_held", publicSummary: "Your verified harmful report opened trusted moderation." });
  const batches = await ctx.db.query("purchasePayoutBatches").withIndex("by_skill", (query) => query.eq("skillId", skill._id)).collect();
  for (const batch of batches.filter((item) => item.state === "open")) await ctx.db.patch(batch._id, { state: "held" });
};

export const create = mutation({
  args: { skillId: v.id("skills"), skillVersionId: v.id("skillVersions"), rating: v.number(), outcome: outcomeValidator, tags: v.array(v.string()), text: v.string(), evidenceArtifactIds: v.array(v.id("evidenceArtifacts")) },
  returns: v.object({ reviewId: v.id("postUseReviews"), state: v.string() }),
  handler: async (ctx, args) => {
    ensureReviewInput(args.rating, args.text);
    const principal = await requirePrincipal(ctx);
    const clusterId = await getOrCreatePrincipalCluster(ctx, principal.principalId);
    const grant = (await ctx.db.query("accessGrants").withIndex("by_user_skill", (query) => query.eq("userId", principal.principalId).eq("skillId", args.skillId)).collect()).find((item) => item.active !== false && item.redeemedAt && item.skillVersionId === args.skillVersionId);
    if (!grant) throw new ConvexError({ code: "REDEEMED_GRANT_REQUIRED", message: "Reviewing requires a redeemed grant for this exact version." });
    const existing = await ctx.db.query("postUseReviews").withIndex("by_version_and_cluster", (query) => query.eq("skillVersionId", args.skillVersionId).eq("identityClusterId", clusterId)).collect();
    if (existing.some((item) => item.state !== "removed")) throw new ConvexError({ code: "ACTIVE_REVIEW_EXISTS", message: "This identity cluster already has a review for the version." });
    const harmfulVerified = args.outcome === "harmful" && await verifiedEvidence(ctx, args.evidenceArtifactIds, principal.principalId, args.skillVersionId);
    const now = Date.now();
    const reviewId = await ctx.db.insert("postUseReviews", { skillId: args.skillId, skillVersionId: args.skillVersionId, accessGrantId: grant._id, reviewerPrincipalId: principal.principalId, identityClusterId: clusterId, rating: args.rating, outcome: args.outcome, tags: [...new Set(args.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))], text: args.text.trim(), state: harmfulVerified ? "moderation" : "pending_reputation", finalizeAt: now + 7 * DAY_MS, createdAt: now });
    const revisionId = await ctx.db.insert("postUseReviewRevisions", { reviewId, revisionNumber: 1, rating: args.rating, outcome: args.outcome, tags: args.tags, text: args.text.trim(), evidenceArtifactIds: args.evidenceArtifactIds, createdAt: now });
    await ctx.db.patch(reviewId, { currentRevisionId: revisionId });
    const review = await ctx.db.get(reviewId);
    if (harmfulVerified && review) await quarantine(ctx, review);
    return { reviewId, state: harmfulVerified ? "moderation" : "pending_reputation" };
  },
});

export const revise = mutation({
  args: { reviewId: v.id("postUseReviews"), rating: v.number(), outcome: outcomeValidator, tags: v.array(v.string()), text: v.string(), evidenceArtifactIds: v.array(v.id("evidenceArtifacts")) },
  returns: v.object({ revisionId: v.id("postUseReviewRevisions"), state: v.string() }),
  handler: async (ctx, args) => {
    ensureReviewInput(args.rating, args.text);
    const principal = await requirePrincipal(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.reviewerPrincipalId !== principal.principalId || review.state === "finalized" || review.state === "removed") throw new ConvexError({ code: "INVALID_STATE", message: "Review cannot be revised." });
    const previous = review.currentRevisionId ? await ctx.db.get(review.currentRevisionId) : null;
    const harmfulVerified = args.outcome === "harmful" && await verifiedEvidence(ctx, args.evidenceArtifactIds, principal.principalId, review.skillVersionId);
    const revisionId = await ctx.db.insert("postUseReviewRevisions", { reviewId: review._id, revisionNumber: (previous?.revisionNumber ?? 0) + 1, rating: args.rating, outcome: args.outcome, tags: args.tags, text: args.text.trim(), evidenceArtifactIds: args.evidenceArtifactIds, supersedesRevisionId: previous?._id, createdAt: Date.now() });
    await ctx.db.patch(review._id, { currentRevisionId: revisionId, rating: args.rating, outcome: args.outcome, tags: args.tags, text: args.text.trim(), state: harmfulVerified ? "moderation" : "pending_reputation", finalizeAt: Date.now() + 7 * DAY_MS, finalizedAt: undefined });
    if (harmfulVerified) await quarantine(ctx, { ...review, currentRevisionId: revisionId, rating: args.rating, outcome: args.outcome, text: args.text, state: "moderation" });
    return { revisionId, state: harmfulVerified ? "moderation" : "pending_reputation" };
  },
});

export const respond = mutation({
  args: { reviewId: v.id("postUseReviews"), text: v.string() },
  returns: v.id("postUseReviewResponses"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const review = await ctx.db.get(args.reviewId);
    const skill = review ? await ctx.db.get(review.skillId) : null;
    if (!review || !skill || skill.authorUserId !== principal.principalId || !args.text.trim()) throw new ConvexError({ code: "FORBIDDEN", message: "Only the author may post one nonempty response." });
    const existing = await ctx.db.query("postUseReviewResponses").withIndex("by_review", (query) => query.eq("reviewId", review._id)).unique();
    if (existing) throw new ConvexError({ code: "RESPONSE_EXISTS", message: "This review already has an author response." });
    return await ctx.db.insert("postUseReviewResponses", { reviewId: review._id, authorPrincipalId: principal.principalId, text: args.text.trim(), createdAt: Date.now() });
  },
});

export const dispute = mutation({
  args: { reviewId: v.id("postUseReviews"), evidenceArtifactIds: v.array(v.id("evidenceArtifacts")) },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const review = await ctx.db.get(args.reviewId);
    const skill = review ? await ctx.db.get(review.skillId) : null;
    if (!review || !skill || skill.authorUserId !== principal.principalId || Date.now() > review.createdAt + 7 * DAY_MS) throw new ConvexError({ code: "FORBIDDEN", message: "Author review dispute window is unavailable." });
    if (!(await verifiedEvidence(ctx, args.evidenceArtifactIds, principal.principalId, review.skillVersionId))) throw new ConvexError({ code: "VERIFIED_EVIDENCE_REQUIRED", message: "A review dispute requires verified evidence." });
    await ctx.db.patch(review._id, { state: "moderation" });
    return { state: "moderation" };
  },
});

const emitReviewEvents = async (ctx: MutationCtx, review: Doc<"postUseReviews">, score: number) => {
  const strength = review.currentRevisionId ? ((await ctx.db.get(review.currentRevisionId))?.evidenceArtifactIds.length ?? 0) > 0 ? 0.5 : 0.2 : 0.2;
  for (const tag of review.tags.length ? review.tags : ["general"]) {
    const existing = await ctx.db.query("reputationEvents").withIndex("by_source_and_tag", (query) => query.eq("sourceType", "post_use_review").eq("sourceId", String(review._id)).eq("tag", tag)).collect();
    if (existing.some((item) => item.subjectType === "skill_version" && item.subjectId === String(review.skillVersionId))) continue;
    await ctx.db.insert("reputationEvents", { subjectType: "skill_version", subjectId: String(review.skillVersionId), tag, sourceType: "post_use_review", sourceId: String(review._id), finalDecisionId: String(review._id), score, signalStrength: strength, identityClusterId: review.identityClusterId, occurredAt: Date.now(), policyVersion: POLICY_V2.version });
  }
};

export const finalizeDue = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ finalized: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.db.query("postUseReviews").withIndex("by_state_and_finalizeAt", (query) => query.eq("state", "pending_reputation").lte("finalizeAt", now)).take(Math.min(100, args.limit ?? 50));
    for (const review of due) {
      await emitReviewEvents(ctx, review, ratingToScore(review.rating as 1 | 2 | 3 | 4 | 5));
      await ctx.db.patch(review._id, { state: "finalized", finalizedAt: now });
      const skill = await ctx.db.get(review.skillId);
      await recordPrincipalActivity(ctx, { principalId: review.reviewerPrincipalId, role: "reviewer", resourceType: "postUseReview", resourceId: String(review._id), eventType: "review_finalized", publicSummary: "Post-use review finalized into reputation.", occurredAt: now });
      if (skill) await recordPrincipalActivity(ctx, { principalId: skill.authorUserId, role: "author", resourceType: "postUseReview", resourceId: String(review._id), eventType: "review_finalized", publicSummary: "A post-use review finalized for your skill.", occurredAt: now });
    }
    return { finalized: due.length };
  },
});

export const moderate = mutation({
  args: { reviewId: v.id("postUseReviews"), resolution: v.union(v.literal("uphold"), v.literal("remove"), v.literal("clear_harm")), publicRationale: v.string() },
  returns: v.object({ state: v.string() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, principal);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.state !== "moderation" || !args.publicRationale.trim()) throw new ConvexError({ code: "INVALID_STATE", message: "Review moderation is unavailable." });
    if (args.resolution === "uphold") {
      await emitReviewEvents(ctx, review, review.outcome === "harmful" ? 0 : ratingToScore(review.rating as 1 | 2 | 3 | 4 | 5));
      await ctx.db.patch(review._id, { state: "finalized", finalizedAt: Date.now() });
    } else if (args.resolution === "remove") {
      await ctx.db.patch(review._id, { state: "removed", finalizedAt: Date.now() });
    } else {
      await ctx.db.patch(review._id, { state: "finalized", finalizedAt: Date.now(), outcome: "no_effect" });
      await emitReviewEvents(ctx, { ...review, outcome: "no_effect" }, ratingToScore(review.rating as 1 | 2 | 3 | 4 | 5));
    }
    if (review.outcome === "harmful") {
      const skill = await ctx.db.get(review.skillId);
      if (skill) {
        const nextState = args.resolution === "uphold" ? "quarantined" : "clear";
        await ctx.db.patch(skill._id, { quarantineState: nextState, publishedVersionId: nextState === "clear" ? skill.publishedVersionId : skill.safeFallbackVersionId });
        await ctx.db.patch(review.skillVersionId, { quarantineState: nextState });
        await ctx.db.insert("quarantineEvents", { skillId: skill._id, skillVersionId: review.skillVersionId, triggeringReviewId: review._id, priorState: "held", nextState, reason: args.resolution, publicRedaction: args.publicRationale.trim(), salesHeld: nextState !== "clear", purchasePayoutsHeld: nextState !== "clear", safeFallbackVersionId: skill.safeFallbackVersionId, resolvedByPrincipalId: principal.principalId, occurredAt: Date.now() });
        await recordPrincipalActivity(ctx, { principalId: skill.authorUserId, role: "author", resourceType: "skillVersion", resourceId: String(review.skillVersionId), eventType: "quarantine_resolved", publicSummary: `Skill quarantine resolved as ${nextState}.` });
      }
    }
    await recordPrincipalActivity(ctx, { principalId: review.reviewerPrincipalId, role: "reviewer", resourceType: "postUseReview", resourceId: String(review._id), eventType: "review_moderated", publicSummary: `Post-use review moderation resolved as ${args.resolution}.` });
    return { state: args.resolution === "remove" ? "removed" : "finalized" };
  },
});

export const listModerationQueue = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: principal.principalId, role: "security_adjudicator" });
    const rows = await ctx.db.query("postUseReviews").withIndex("by_state_and_finalizeAt", (query) => query.eq("state", "moderation")).take(100);
    return await Promise.all(rows.map(async (review) => {
      const revision = review.currentRevisionId ? await ctx.db.get(review.currentRevisionId) : null;
      return { reviewId: review._id, skillId: review.skillId, skillVersionId: review.skillVersionId, rating: review.rating, outcome: review.outcome, tags: review.tags, text: review.text, createdAt: review.createdAt, evidenceArtifactIds: revision?.evidenceArtifactIds ?? [] };
    }));
  },
});

export const publicReview = query({
  args: { reviewId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const reviewId = ctx.db.normalizeId("postUseReviews", args.reviewId);
    if (!reviewId) return null;
    const review = await ctx.db.get(reviewId);
    if (!review || review.state === "removed") return null;
    const response = await ctx.db.query("postUseReviewResponses").withIndex("by_review", (query) => query.eq("reviewId", review._id)).unique();
    const profile = await ctx.db.query("publicProfiles").withIndex("by_principal", (query) => query.eq("principalId", review.reviewerPrincipalId)).unique();
    return { reviewId: review._id, skillId: review.skillId, skillVersionId: review.skillVersionId, reviewerHandle: profile?.handle ?? "verified-user", rating: review.rating, outcome: review.outcome, tags: review.tags, text: review.text, state: review.state, createdAt: review.createdAt, response: response ? { text: response.text, createdAt: response.createdAt } : null };
  },
});

export const listForSkill = query({
  args: { skillId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    if (!skillId) return [];
    return (await ctx.db.query("postUseReviews").withIndex("by_skill_and_state", (query) => query.eq("skillId", skillId)).collect()).filter((review) => review.state !== "removed").map((review) => ({ reviewId: review._id, skillVersionId: review.skillVersionId, rating: review.rating, outcome: review.outcome, tags: review.tags, text: review.text, state: review.state, createdAt: review.createdAt }));
  },
});
