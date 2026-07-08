import { ConvexError, type Infer, v } from "convex/values";

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
  contentMarkdown: v.string(),
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

    const safeSkill =
      skill && (skill.status === "published" || hasAccess)
        ? skill
        : skill
          ? { ...skill, contentMarkdown: "" }
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

export const list = query({
  args: {
    status: v.optional(catalogStatusValidator),
    q: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    authorId: v.optional(v.string()),
  },
  returns: v.array(catalogItemValidator),
  handler: async (ctx, args) => {
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
