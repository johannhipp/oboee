import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import {
  adoptionBps,
  bayesianReputationScore,
  confidenceAdjustedScore,
  confidenceForCount,
  discoveryScoreBps,
  recencyBps,
} from "./lib/reputationPolicy";
import { basisPoints, POLICY_V2 } from "./lib/policy";
import { recordPrincipalActivity } from "./lib/activity";

const DAY_MS = 24 * 60 * 60 * 1_000;

const clusterFor = async (ctx: MutationCtx, principalId: string) => {
  const memberships = await ctx.db.query("identityClusterMemberships").withIndex("by_principal", (query) => query.eq("principalId", principalId)).collect();
  const membership = memberships.find((item) => item.activeUntil === undefined);
  if (!membership) throw new ConvexError({ code: "IDENTITY_CLUSTER_REQUIRED", message: "Principal has no active identity cluster." });
  return membership.clusterId;
};

const insertReputationEvent = async (
  ctx: MutationCtx,
  args: Omit<Doc<"reputationEvents">, "_id" | "_creationTime">,
) => {
  const existing = await ctx.db.query("reputationEvents").withIndex("by_source_and_tag", (query) => query.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId).eq("tag", args.tag)).collect();
  const duplicate = existing.find((item) => item.subjectType === args.subjectType && item.subjectId === args.subjectId);
  return duplicate?._id ?? await ctx.db.insert("reputationEvents", args);
};

export const emitFinalRfsReputation = async (
  ctx: MutationCtx,
  args: {
    assessment: Doc<"payoutAssessments">;
    rfs: Doc<"rfs">;
    skillVersion: Doc<"skillVersions">;
    criteria: Doc<"rfsCriteria">[];
    results: Readonly<Record<string, "passed" | "failed" | "not_run">>;
    decisionKind: "accepted" | "partial" | "rejected" | "harmful" | "abandoned";
  },
) => {
  const sourceCluster = await clusterFor(ctx, args.rfs.authorUserId);
  const tags = [...new Set(args.criteria.flatMap((criterion) => criterion.tags.length ? criterion.tags : args.rfs.tags))];
  for (const tag of tags) {
    const tagged = args.criteria.filter((criterion) => (criterion.tags.length ? criterion.tags : args.rfs.tags).includes(tag));
    const total = tagged.reduce((sum, criterion) => sum + criterion.weightBps, 0);
    const passed = tagged.filter((criterion) => args.results[String(criterion._id)] === "passed").reduce((sum, criterion) => sum + criterion.weightBps, 0);
    const score = args.decisionKind === "harmful" || args.decisionKind === "abandoned" ? 0 : total ? (100 * passed) / total : 0;
    const common = { tag, sourceType: "rfs_evaluation" as const, sourceId: String(args.assessment._id), finalDecisionId: String(args.assessment._id), score, signalStrength: 1, identityClusterId: sourceCluster, occurredAt: args.assessment.decidedAt ?? Date.now(), policyVersion: POLICY_V2.version };
    await insertReputationEvent(ctx, { ...common, subjectType: "skill_version", subjectId: String(args.skillVersion._id) });
    await insertReputationEvent(ctx, { ...common, subjectType: "author_tag", subjectId: args.assessment.authorUserId });
  }
  const evaluations = await ctx.db.query("evaluationEvents").withIndex("by_skillVersionId", (query) => query.eq("skillVersionId", args.skillVersion._id)).collect();
  for (const evaluation of evaluations.filter((item) => item.active !== false && item.identityClusterId)) {
    const rows = await ctx.db.query("evaluationCriterionResults").withIndex("by_evaluation", (query) => query.eq("evaluationId", evaluation._id)).collect();
    const addressed = rows.length;
    const matching = rows.filter((row) => args.results[String(row.criterionId)] === row.result).length;
    const score = addressed ? (100 * matching) / addressed : 0;
    for (const tag of evaluation.vulnerabilityTags.length ? evaluation.vulnerabilityTags : args.rfs.tags) {
      await insertReputationEvent(ctx, { subjectType: "reviewer_tag", subjectId: evaluation.principalId ?? evaluation.reviewerIdentityId, tag, sourceType: "reviewer_accuracy", sourceId: String(evaluation._id), finalDecisionId: String(args.assessment._id), score: evaluation.outcome === "harmful" && args.decisionKind !== "harmful" ? 0 : score, signalStrength: 1, identityClusterId: evaluation.identityClusterId!, occurredAt: args.assessment.decidedAt ?? Date.now(), policyVersion: POLICY_V2.version });
    }
  }
  await recordPrincipalActivity(ctx, { principalId: args.skillVersion.authorUserId, role: "author", resourceType: "skillVersion", resourceId: String(args.skillVersion._id), eventType: "reputation_finalized", publicSummary: `Final ${args.decisionKind} decision updated skill and author reputation.` });
  for (const reviewerId of new Set(evaluations.map((evaluation) => evaluation.principalId ?? evaluation.reviewerIdentityId))) {
    await recordPrincipalActivity(ctx, { principalId: reviewerId, role: "reviewer", resourceType: "skillVersion", resourceId: String(args.skillVersion._id), eventType: "reviewer_reputation_finalized", publicSummary: "A final decision updated reviewer calibration." });
  }
};

const rebuildSubject = async (
  ctx: MutationCtx,
  subjectType: Doc<"reputationEvents">["subjectType"],
  subjectId: string,
  tag: string,
  now: number,
) => {
  const events = await ctx.db.query("reputationEvents").withIndex("by_subject_and_tag", (query) => query.eq("subjectType", subjectType).eq("subjectId", subjectId).eq("tag", tag)).collect();
  const seen = new Set<string>();
  const signals = events.map((event) => {
    const key = `${String(event.identityClusterId)}:${event.sourceId}:${tag}`;
    const independent = !seen.has(key);
    seen.add(key);
    return { score: event.score, signalStrength: event.signalStrength, ageDays: Math.max(0, (now - event.occurredAt) / DAY_MS), independent };
  });
  const independentCount = signals.filter((signal) => signal.independent).length;
  const score = bayesianReputationScore(signals);
  const confidence = confidenceForCount(independentCount);
  return { score, adjustedScore: confidenceAdjustedScore(score, confidence), confidence, independentCount };
};

export const rebuildSnapshots = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ rebuilt: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const events = await ctx.db.query("reputationEvents").take(Math.min(1_000, args.limit ?? 500));
    const subjects = new Map<string, { subjectType: Doc<"reputationEvents">["subjectType"]; subjectId: string; tag: string }>();
    for (const event of events) subjects.set(`${event.subjectType}:${event.subjectId}:${event.tag}`, event);
    for (const subject of subjects.values()) {
      const score = await rebuildSubject(ctx, subject.subjectType, subject.subjectId, subject.tag, now);
      if (subject.subjectType === "skill_version") {
        const versionId = ctx.db.normalizeId("skillVersions", subject.subjectId);
        if (!versionId) continue;
        const existing = await ctx.db.query("skillQualitySnapshots").withIndex("by_skillVersion_and_tag", (query) => query.eq("skillVersionId", versionId).eq("tag", subject.tag)).unique();
        const values = { skillVersionId: versionId, tag: subject.tag, ...score, computedAt: now, algorithmVersion: 2, policyVersion: POLICY_V2.version };
        if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("skillQualitySnapshots", values);
      } else if (subject.subjectType === "author_tag") {
        const existing = await ctx.db.query("authorReputationSnapshots").withIndex("by_principal_and_tag", (query) => query.eq("principalId", subject.subjectId).eq("tag", subject.tag)).unique();
        const values = { principalId: subject.subjectId, tag: subject.tag, ...score, computedAt: now, algorithmVersion: 2, policyVersion: POLICY_V2.version };
        if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("authorReputationSnapshots", values);
      } else {
        const existing = await ctx.db.query("reviewerTrustSnapshots").withIndex("by_principal_and_tag", (query) => query.eq("principalId", subject.subjectId).eq("tag", subject.tag)).unique();
        const values = { principalId: subject.subjectId, tag: subject.tag, trustBps: Math.max(0, Math.min(10_000, Math.floor(score.adjustedScore * 100))), confidence: score.confidence, independentCount: score.independentCount, computedAt: now, algorithmVersion: 2, policyVersion: POLICY_V2.version };
        if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("reviewerTrustSnapshots", values);
      }
    }
    return { rebuilt: subjects.size };
  },
});

export const refreshDiscovery = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ refreshed: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const skills = await ctx.db.query("skills").withIndex("by_status", (query) => query.eq("status", "published")).collect();
    const rawAdoption = new Map<string, number>();
    for (const skill of skills) {
      if (!skill.publishedVersionId) continue;
      const installs = await ctx.db.query("installEvents").withIndex("by_skillVersion", (query) => query.eq("skillVersionId", skill.publishedVersionId!)).collect();
      const byCluster = new Map<string, number>();
      for (const install of installs.filter((item) => item.redeemedAt >= now - 180 * DAY_MS)) {
        const key = String(install.identityClusterId);
        byCluster.set(key, Math.max(byCluster.get(key) ?? 0, install.adoptionWeightBps));
      }
      rawAdoption.set(String(skill._id), [...byCluster.values()].reduce((sum, weight) => sum + weight / 10_000, 0));
    }
    const adoptionValues = [...rawAdoption.values()].sort((left, right) => left - right);
    const p95 = adoptionValues.length ? adoptionValues[Math.min(adoptionValues.length - 1, Math.floor(adoptionValues.length * 0.95))] : 1;
    let refreshed = 0;
    for (const skill of skills) {
      if (!skill.publishedVersionId || skill.quarantineState === "quarantined") continue;
      const [version, snapshots, profile] = await Promise.all([
        ctx.db.get(skill.publishedVersionId),
        ctx.db.query("skillQualitySnapshots").withIndex("by_skillVersion_and_tag", (query) => query.eq("skillVersionId", skill.publishedVersionId!)).collect(),
        ctx.db.query("publicProfiles").withIndex("by_principal", (query) => query.eq("principalId", skill.authorUserId)).unique(),
      ]);
      if (!version) continue;
      const quality = snapshots.length ? Math.floor(snapshots.reduce((sum, item) => sum + item.adjustedScore * 100, 0) / snapshots.length) : 5_000;
      const confidence = confidenceForCount(snapshots.reduce((sum, item) => sum + item.independentCount, 0));
      const independentCount = snapshots.reduce((sum, item) => sum + item.independentCount, 0);
      const adoption = adoptionBps(rawAdoption.get(String(skill._id)) ?? 0, p95 || 1);
      const recency = recencyBps(Math.max(0, (now - (version.publishedAt ?? version.submittedAt)) / DAY_MS));
      const total = discoveryScoreBps({ qualityBps: basisPoints(quality), adoptionBps: adoption, recencyBps: recency });
      const existing = await ctx.db.query("discoveryProjection").withIndex("by_skill", (query) => query.eq("skillId", skill._id)).unique();
      const values = { skillId: skill._id, skillVersionId: version._id, category: skill.tags[0] ?? "general", tags: skill.tags, authorHandle: profile?.handle ?? `author-${skill.authorUserId.slice(-8)}`, qualityBps: quality, adoptionBps: adoption, recencyBps: recency, totalBps: total, confidence, independentCount, quarantineState: skill.quarantineState ?? "clear" as const, publishedAt: version.publishedAt ?? version.submittedAt, computedAt: now, algorithmVersion: 2, policyVersion: POLICY_V2.version };
      if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("discoveryProjection", values);
      refreshed += 1;
    }
    return { refreshed };
  },
});

export const catalog = query({
  args: { category: v.optional(v.string()), authorHandle: v.optional(v.string()), tags: v.optional(v.array(v.string())), cursor: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rows = args.category
      ? await ctx.db.query("discoveryProjection").withIndex("by_category_and_totalBps", (query) => query.eq("category", args.category!)).order("desc").take(200)
      : args.authorHandle
        ? await ctx.db.query("discoveryProjection").withIndex("by_authorHandle_and_totalBps", (query) => query.eq("authorHandle", args.authorHandle!)).order("desc").take(200)
        : await ctx.db.query("discoveryProjection").take(200);
    const tags = new Set(args.tags ?? []);
    const sorted = rows.filter((row) => row.quarantineState === "clear" && (tags.size === 0 || row.tags.some((tag) => tags.has(tag)))).sort((left, right) => right.totalBps - left.totalBps || String(left.skillId).localeCompare(String(right.skillId)));
    const start = args.cursor ? Math.max(0, sorted.findIndex((row) => String(row._id) === args.cursor) + 1) : 0;
    const page = sorted.slice(start, start + Math.min(100, Math.max(1, args.limit ?? 20)));
    const items = await Promise.all(page.map(async (row) => {
      const skill = await ctx.db.get(row.skillId);
      const rfs = skill ? await ctx.db.get(skill.rfsId) : null;
      return {
        ...row,
        title: rfs?.title ?? skill?.summary ?? row.category,
        summary: skill?.summary,
      };
    }));
    return { items, nextCursor: start + page.length < sorted.length ? String(page.at(-1)?._id) : null };
  },
});

export const publicAuthor = query({
  args: { handle: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("publicProfiles").withIndex("by_handle", (query) => query.eq("handle", args.handle)).unique();
    if (!profile) return null;
    const [reputation, sources] = await Promise.all([
      ctx.db.query("authorReputationSnapshots").filter((query) => query.eq(query.field("principalId"), profile.principalId)).collect(),
      ctx.db.query("reputationEvents").filter((query) => query.and(query.eq(query.field("subjectType"), "author_tag"), query.eq(query.field("subjectId"), profile.principalId))).take(100),
    ]);
    const skills = await ctx.db.query("skills").filter((query) => query.eq(query.field("authorUserId"), profile.principalId)).collect();
    return {
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      links: profile.links,
      reputation: reputation.map((snapshot) => ({ tag: snapshot.tag, score: snapshot.score, adjustedScore: snapshot.adjustedScore, confidence: snapshot.confidence, independentCount: snapshot.independentCount, computedAt: snapshot.computedAt, algorithmVersion: snapshot.algorithmVersion })),
      sourceSummaries: sources.sort((left, right) => right.occurredAt - left.occurredAt).map((source) => ({ tag: source.tag, sourceType: source.sourceType, sourceId: source.sourceId, finalDecisionId: source.finalDecisionId, score: source.score, signalStrengthClass: source.signalStrength >= 0.75 ? "strong" : source.signalStrength >= 0.4 ? "medium" : "light", ageDays: Math.max(0, Math.floor((Date.now() - source.occurredAt) / DAY_MS)), occurredAt: source.occurredAt })),
      publishedSkills: skills.filter((skill) => skill.status === "published" && skill.publishedVersionId).map((skill) => ({ skillId: skill._id, rfsId: skill.rfsId, summary: skill.summary, tags: skill.tags, publishedVersionId: skill.publishedVersionId })),
    };
  },
});
