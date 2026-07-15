import { ConvexError, type Infer, v } from "convex/values";

import { query } from "./_generated/server";
import { authComponent } from "./auth";

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
  status: v.union(v.literal("draft"), v.literal("submitted"), v.literal("published")),
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
  status: v.union(
    v.literal("open"),
    v.literal("funded"),
    v.literal("fulfilled"),
    v.literal("published"),
    v.literal("cancelled"),
  ),
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

const cleanTags = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

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
    canFund: v.boolean(),
    canClaim: v.boolean(),
    canBuy: v.boolean(),
    hasAccess: v.boolean(),
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

    if (skill && viewer) {
      if (skill.authorUserId === viewer._id) {
        hasAccess = true;
      } else {
        const grant = await ctx.db
          .query("accessGrants")
          .withIndex("by_user_skill", (q) => q.eq("userId", viewer._id).eq("skillId", skill._id))
          .first();
        hasAccess = Boolean(grant);
      }
    }

    const hasClaimant = Boolean(rfs.claimantUserId);
    const canFund = rfs.status === "open";
    const canClaim = rfs.status === "funded" && !hasClaimant;
    const canBuy = Boolean(skill && skill.status === "published" && !hasAccess);

    return {
      rfs,
      skill,
      canFund,
      canClaim,
      canBuy,
      hasAccess,
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
        if (!rfs) {
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
