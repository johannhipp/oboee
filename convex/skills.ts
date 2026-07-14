import { ConvexError, type Infer, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { authComponent } from "./auth";
import {
  rfsStatusValidator,
  skillStatusValidator,
  payoutAssessmentStatusValidator,
} from "./lib/validators";
import {
  cleanTags,
  getLatestAssessment,
  getLatestSkillVersion,
  userBackedRfs,
} from "./lib/helpers";
import { POLICY_V2 } from "./lib/policy";
import { retirePolicyV1 } from "./lib/legacy";
import { fallbackAuthorHandle } from "./lib/publicIdentity";

const catalogStatusValidator = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("published"),
);
const skillDocValidator = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  latestVersion: v.optional(v.number()),
  latestContentHash: v.optional(v.string()),
  status: skillStatusValidator,
});

const skillVersionSummaryValidator = v.object({
  _id: v.id("skillVersions"),
  version: v.number(),
  contentHash: v.string(),
  status: skillStatusValidator,
  evaluationDeadline: v.number(),
  submittedAt: v.number(),
});

const payoutAssessmentSummaryValidator = v.object({
  _id: v.id("payoutAssessments"),
  status: payoutAssessmentStatusValidator,
  qualityMultiplierBps: v.number(),
  finalPayoutBaseUnits: v.int64(),
  assessmentReason: v.string(),
});

const rfsDocValidator = v.object({
  _id: v.id("rfs"),
  _creationTime: v.number(),
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
  status: rfsStatusValidator,
});

const catalogItemValidator = v.object({
  itemType: v.union(v.literal("rfs"), v.literal("skill")),
  itemId: v.string(),
  rfsId: v.id("rfs"),
  skillId: v.optional(v.id("skills")),
  status: catalogStatusValidator,
  authorUserId: v.string(),
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  summary: v.optional(v.string()),
  tags: v.array(v.string()),
  createdAt: v.number(),
  fundingThresholdBaseUnits: v.optional(v.int64()),
  currentAmountBaseUnits: v.optional(v.int64()),
  purchasePriceBaseUnits: v.optional(v.int64()),
});

const searchMatches = (queryText: string, fields: string[]) => {
  if (!queryText) {
    return true;
  }
  return fields.some((field) => field.toLowerCase().includes(queryText));
};

const isPublicSkillVersion = (skill: Doc<"skills">, version: Doc<"skillVersions">) => {
  if (version.skillId !== skill._id || version.status !== "published") return false;
  if (skill.policyVersion === POLICY_V2.version && version.policyVersion === POLICY_V2.version) return true;
  return skill.policyVersion === 1 && version.policyVersion === 1 && version.legacyImported === true;
};

/** @deprecated Mixed policy-v1 detail is retired. Use skills.getPublic and v2 routes. */
export const get = query({
  args: {
    skillId: v.optional(v.id("skills")),
    rfsId: v.optional(v.id("rfs")),
  },
  returns: v.object({
    rfs: v.optional(rfsDocValidator),
    skill: v.optional(skillDocValidator),
    latestSkillVersion: v.optional(skillVersionSummaryValidator),
    payoutAssessment: v.optional(payoutAssessmentSummaryValidator),
    evaluationCount: v.number(),
    canFund: v.boolean(),
    canClaim: v.boolean(),
    canBuy: v.boolean(),
    hasAccess: v.boolean(),
    canEvaluate: v.boolean(),
    canRevise: v.boolean(),
    canClaimPayout: v.boolean(),
  }),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/skills/{skillId}");
    if (!args.skillId && !args.rfsId) {
      throw new ConvexError({
        code: "INVALID_ARGUMENT",
        message: "Provide either skillId or rfsId.",
      });
    }

    let skill = args.skillId ? (await ctx.db.get(args.skillId)) ?? undefined : undefined;

    if (!skill && args.rfsId) {
      const skillByRfs = await ctx.db
        .query("skills")
        .withIndex("by_rfs", (q) => q.eq("rfsId", args.rfsId!))
        .first();
      skill = skillByRfs ?? undefined;
    }

    if (!skill && args.skillId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }

    const targetRfsId = args.rfsId ?? skill?.rfsId;
    if (!targetRfsId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }

    const rfs = await ctx.db.get(targetRfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }

    const viewer = await authComponent.safeGetAuthUser(ctx);
    let hasAccess = false;
    let viewerIsBacker = false;

    if (viewer) {
      viewerIsBacker = await userBackedRfs(ctx, rfs._id, viewer._id);
    }

    if (skill && viewer) {
      if (skill.authorUserId === viewer._id || rfs.authorUserId === viewer._id || viewerIsBacker) {
        hasAccess = true;
      } else {
        const grant = await ctx.db
          .query("accessGrants")
          .withIndex("by_user_skill", (q) => q.eq("userId", viewer._id).eq("skillId", skill._id))
          .first();
        hasAccess = Boolean(grant);
      }
    }

    const latestSkillVersion = skill
      ? await getLatestSkillVersion(ctx, skill._id)
      : undefined;
    const payoutAssessment = await getLatestAssessment(ctx, rfs._id);
    const evaluationCount = latestSkillVersion
      ? await ctx.db
          .query("evaluationEvents")
          .withIndex("by_skillVersionId", (q) => q.eq("skillVersionId", latestSkillVersion._id))
          .collect()
          .then((events) => events.length)
      : 0;

    const safeSkill = skill
      ? {
          _id: skill._id,
          _creationTime: skill._creationTime,
          rfsId: skill.rfsId,
          authorUserId: skill.authorUserId,
          summary: skill.summary,
          tags: skill.tags,
          purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
          latestVersion: skill.latestVersion,
          latestContentHash: skill.latestContentHash,
          status: skill.status,
        }
      : undefined;

    const hasClaimant = Boolean(rfs.claimantUserId);
    const canFund = rfs.status === "open";
    const canClaim = rfs.status === "funded" && !hasClaimant;
    const canBuy = Boolean(skill && skill.status === "published" && !hasAccess);
    const canEvaluate = Boolean(
      viewer &&
        latestSkillVersion &&
        rfs.claimantUserId !== viewer._id &&
        (rfs.authorUserId === viewer._id || viewerIsBacker) &&
        (rfs.status === "evaluation_open" || rfs.status === "disputed"),
    );
    const canRevise = Boolean(viewer && rfs.claimantUserId === viewer._id && rfs.status === "revision_requested");
    const canClaimPayout = Boolean(
      viewer &&
        rfs.claimantUserId === viewer._id &&
        rfs.status === "published" &&
        payoutAssessment &&
        (payoutAssessment.status === "claimable" ||
          payoutAssessment.status === "reduced" ||
          payoutAssessment.status === "manually_resolved") &&
        payoutAssessment.finalPayoutBaseUnits > BigInt(0),
    );

    return {
      rfs,
      skill: safeSkill,
      latestSkillVersion: latestSkillVersion
        ? {
            _id: latestSkillVersion._id,
            version: latestSkillVersion.version,
            contentHash: latestSkillVersion.contentHash,
            status: latestSkillVersion.status,
            evaluationDeadline: latestSkillVersion.evaluationDeadline,
            submittedAt: latestSkillVersion.submittedAt,
          }
        : undefined,
      payoutAssessment: payoutAssessment
        ? {
            _id: payoutAssessment._id,
            status: payoutAssessment.status,
            qualityMultiplierBps: payoutAssessment.qualityMultiplierBps,
            finalPayoutBaseUnits: payoutAssessment.finalPayoutBaseUnits,
            assessmentReason: payoutAssessment.assessmentReason,
          }
        : undefined,
      evaluationCount,
      canFund,
      canClaim,
      canBuy,
      hasAccess,
      canEvaluate,
      canRevise,
      canClaimPayout,
    };
  },
});

/** @deprecated Mixed policy-v1 catalog is retired. Use reputation.catalog and v2 routes. */
export const list = query({
  args: {
    status: v.optional(catalogStatusValidator),
    q: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    authorId: v.optional(v.string()),
  },
  returns: v.array(catalogItemValidator),
  handler: async (ctx, args) => {
    retirePolicyV1("GET /api/v2/catalog");
    const normalizedQuery = args.q?.trim().toLowerCase() ?? "";
    const requiredTags = cleanTags(args.tags ?? []);
    const statusFilter = args.status;

    const statusTargets = statusFilter
      ? [statusFilter]
      : (["open", "funded", "published"] as const);

    const rfsItems: Array<Infer<typeof catalogItemValidator>> = [];

    if (statusTargets.includes("open") || statusTargets.includes("funded")) {
      const openRfs = statusTargets.includes("open")
        ? await ctx.db
            .query("rfs")
            .withIndex("by_status", (q) => q.eq("status", "open"))
            .order("desc")
            .collect()
        : [];
      const fundedRfs = statusTargets.includes("funded")
        ? await ctx.db
            .query("rfs")
            .withIndex("by_status", (q) => q.eq("status", "funded"))
            .order("desc")
            .collect()
        : [];

      for (const rfs of [...openRfs, ...fundedRfs]) {
        rfsItems.push({
          itemType: "rfs",
          itemId: rfs._id,
          rfsId: rfs._id,
          skillId: undefined,
          status: rfs.status as "open" | "funded",
          authorUserId: rfs.authorUserId,
          title: rfs.title,
          description: rfs.description,
          scope: rfs.scope,
          summary: undefined,
          tags: rfs.tags,
          createdAt: rfs._creationTime,
          fundingThresholdBaseUnits: rfs.fundingThresholdBaseUnits,
          currentAmountBaseUnits: rfs.currentAmountBaseUnits,
          purchasePriceBaseUnits: undefined,
        });
      }
    }

    const skillItems: Array<Infer<typeof catalogItemValidator>> = [];

    if (statusTargets.includes("published")) {
      const publishedSkills = await ctx.db
        .query("skills")
        .withIndex("by_status", (q) => q.eq("status", "published"))
        .order("desc")
        .collect();

      for (const skill of publishedSkills) {
        const rfs = await ctx.db.get(skill.rfsId);
        if (!rfs || rfs.status !== "published") {
          continue;
        }
        skillItems.push({
          itemType: "skill",
          itemId: skill._id,
          rfsId: skill.rfsId,
          skillId: skill._id,
          status: "published",
          authorUserId: skill.authorUserId,
          title: rfs.title,
          description: rfs.description,
          scope: rfs.scope,
          summary: skill.summary,
          tags: skill.tags,
          createdAt: skill._creationTime,
          fundingThresholdBaseUnits: undefined,
          currentAmountBaseUnits: undefined,
          purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
        });
      }
    }

    return [...rfsItems, ...skillItems]
      .filter((item) => {
        if (args.authorId && item.authorUserId !== args.authorId) {
          return false;
        }
        if (requiredTags.length > 0 && !requiredTags.every((tag) => item.tags.includes(tag))) {
          return false;
        }
        if (
          !searchMatches(normalizedQuery, [item.title, item.description, item.scope, item.summary ?? ""])
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getVersionMetadata = query({
  args: { skillId: v.string(), skillVersionId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    const skillVersionId = ctx.db.normalizeId("skillVersions", args.skillVersionId);
    if (!skillId || !skillVersionId) return null;
    const [skill, version] = await Promise.all([ctx.db.get(skillId), ctx.db.get(skillVersionId)]);
    if (!skill || !version || !isPublicSkillVersion(skill, version)) return null;
    return { skillId: skill._id, skillVersionId: version._id, version: version.version, contentHash: version.contentHash, digestAlgorithm: version.digestAlgorithm, summary: version.summary, tags: version.tags, purchasePriceBaseUnits: version.purchasePriceBaseUnits, quarantineState: version.quarantineState ?? "clear", publishedAt: version.publishedAt, policyVersion: version.policyVersion, legacyImported: version.legacyImported ?? false };
  },
});

export const getPublic = query({
  args: { skillId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    if (!skillId) return null;
    const skill = await ctx.db.get(skillId);
    if (!skill || !skill.publishedVersionId) return null;
    const [version, rfs, profile, qualityRows, installs, reviews] = await Promise.all([
      ctx.db.get(skill.publishedVersionId),
      ctx.db.get(skill.rfsId),
      ctx.db.query("publicProfiles").withIndex("by_principal", (query) => query.eq("principalId", skill.authorUserId)).unique(),
      ctx.db.query("skillQualitySnapshots").filter((query) => query.eq(query.field("skillVersionId"), skill.publishedVersionId!)).collect(),
      ctx.db.query("installEvents").withIndex("by_skillVersion", (query) => query.eq("skillVersionId", skill.publishedVersionId!)).collect(),
      ctx.db.query("postUseReviews").withIndex("by_skill_and_state", (query) => query.eq("skillId", skill._id)).collect(),
    ]);
    if (!version || !rfs || !isPublicSkillVersion(skill, version)) return null;
    const legacyImported = version.legacyImported === true;
    const quality = qualityRows.find((snapshot) => snapshot.tag === "general") ?? qualityRows.sort((left, right) => right.independentCount - left.independentCount)[0];
    const clusters = new Set(installs.filter((install) => install.adoptionWeightBps > 0).map((install) => String(install.identityClusterId)));
    return {
      skillId: skill._id,
      skillVersionId: version._id,
      rfsId: rfs._id,
      title: rfs.title,
      summary: version.summary,
      tags: version.tags,
      authorHandle: profile?.handle ?? fallbackAuthorHandle(skill.authorUserId),
      version: version.version,
      contentHash: version.contentHash,
      digestAlgorithm: version.digestAlgorithm,
      policyVersion: version.policyVersion ?? skill.policyVersion,
      legacyImported,
      purchasePriceBaseUnits: version.purchasePriceBaseUnits,
      quarantineState: version.quarantineState ?? skill.quarantineState ?? "clear",
      status: version.status,
      publishedAt: version.publishedAt,
      quality: quality ? { score: quality.score, adjustedScore: quality.adjustedScore, confidence: quality.confidence, independentCount: quality.independentCount, computedAt: quality.computedAt } : null,
      uniqueVerifiedInstalls: clusters.size,
      reviews: reviews.filter((review) => review.state !== "removed").map((review) => ({ reviewId: review._id, rating: review.rating, outcome: review.outcome, tags: review.tags, text: review.text, state: review.state, createdAt: review.createdAt })),
    };
  },
});

export const getInstallAggregate = query({
  args: { skillId: v.string() },
  returns: v.object({ uniqueVerifiedInstalls: v.number(), weightedAdoptionUnits: v.number() }),
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    if (!skillId) return { uniqueVerifiedInstalls: 0, weightedAdoptionUnits: 0 };
    const skill = await ctx.db.get(skillId);
    if (!skill?.publishedVersionId) return { uniqueVerifiedInstalls: 0, weightedAdoptionUnits: 0 };
    const installs = await ctx.db.query("installEvents").withIndex("by_skillVersion", (query) => query.eq("skillVersionId", skill.publishedVersionId!)).collect();
    const byCluster = new Map<string, number>();
    for (const install of installs) byCluster.set(String(install.identityClusterId), Math.max(byCluster.get(String(install.identityClusterId)) ?? 0, install.adoptionWeightBps));
    return { uniqueVerifiedInstalls: [...byCluster.values()].filter((weight) => weight > 0).length, weightedAdoptionUnits: [...byCluster.values()].reduce((sum, weight) => sum + weight / 10_000, 0) };
  },
});
