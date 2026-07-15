import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";
import {
  canClaimRfs,
  canFundRfs,
  canSubmitRfs,
} from "./lib/rfsDomain";
import { skillMetadataValidator, toSkillMetadata } from "./lib/skillMetadata";
import { rfsDocValidator } from "./lib/validators";

const availableActionValidator = v.union(
  v.object({
    kind: v.literal("fund"),
    rfsId: v.id("rfs"),
    minimumContributionBaseUnits: v.int64(),
    currencyAddress: v.string(),
  }),
  v.object({
    kind: v.literal("claim"),
    rfsId: v.id("rfs"),
    requiresSignIn: v.boolean(),
  }),
  v.object({
    kind: v.literal("submit"),
    rfsId: v.id("rfs"),
  }),
  v.object({
    kind: v.literal("purchase"),
    skillId: v.id("skills"),
    purchasePriceBaseUnits: v.int64(),
    currencyAddress: v.string(),
  }),
  v.object({ kind: v.literal("read"), skillId: v.id("skills") }),
);

const detailValidator = v.object({
  rfs: rfsDocValidator,
  skill: v.optional(skillMetadataValidator),
  hasAccess: v.boolean(),
  availableActions: v.array(availableActionValidator),
});

const hasSkillAccess = async (
  ctx: QueryCtx,
  skill: Doc<"skills"> | undefined,
  viewerUserId: string | undefined,
) => {
  if (!skill || !viewerUserId) {
    return false;
  }
  if (skill.authorUserId === viewerUserId) {
    return true;
  }
  const grant = await ctx.db
    .query("accessGrants")
    .withIndex("by_user_skill", (query) =>
      query.eq("userId", viewerUserId).eq("skillId", skill._id),
    )
    .unique();
  return Boolean(grant);
};

const buildDetail = async (
  ctx: QueryCtx,
  rfs: Doc<"rfs">,
  skill: Doc<"skills"> | undefined,
) => {
  const viewer = await authComponent.safeGetAuthUser(ctx);
  const hasAccess = await hasSkillAccess(ctx, skill, viewer?._id);
  const availableActions: Array<
    | {
        kind: "fund";
        rfsId: Doc<"rfs">["_id"];
        minimumContributionBaseUnits: bigint;
        currencyAddress: string;
      }
    | { kind: "claim"; rfsId: Doc<"rfs">["_id"]; requiresSignIn: boolean }
    | { kind: "submit"; rfsId: Doc<"rfs">["_id"] }
    | {
        kind: "purchase";
        skillId: Doc<"skills">["_id"];
        purchasePriceBaseUnits: bigint;
        currencyAddress: string;
      }
    | { kind: "read"; skillId: Doc<"skills">["_id"] }
  > = [];

  if (canFundRfs(rfs.status)) {
    availableActions.push({
      kind: "fund",
      rfsId: rfs._id,
      minimumContributionBaseUnits: rfs.minimumContributionBaseUnits,
      currencyAddress: rfs.fundingTokenAddress,
    });
  }
  if (canClaimRfs(rfs)) {
    availableActions.push({
      kind: "claim",
      rfsId: rfs._id,
      requiresSignIn: !viewer,
    });
  }
  if (canSubmitRfs(rfs, viewer?._id)) {
    availableActions.push({ kind: "submit", rfsId: rfs._id });
  }
  if (skill && hasAccess) {
    availableActions.push({ kind: "read", skillId: skill._id });
  } else if (skill) {
    availableActions.push({
      kind: "purchase",
      skillId: skill._id,
      purchasePriceBaseUnits: skill.purchasePriceBaseUnits,
      currencyAddress: rfs.fundingTokenAddress,
    });
  }

  return {
    rfs,
    skill: skill ? toSkillMetadata(skill) : undefined,
    hasAccess,
    availableActions,
  };
};

export const getBySkill = query({
  args: { skillId: v.string() },
  returns: detailValidator,
  handler: async (ctx, args) => {
    const skillId = ctx.db.normalizeId("skills", args.skillId);
    const skill = skillId ? await ctx.db.get(skillId) : null;
    if (!skill) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Skill not found." });
    }
    const rfs = await ctx.db.get(skill.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    return buildDetail(ctx, rfs, skill);
  },
});

export const getByRfs = query({
  args: { rfsId: v.string() },
  returns: detailValidator,
  handler: async (ctx, args) => {
    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
    const rfs = rfsId ? await ctx.db.get(rfsId) : null;
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    const skill = await ctx.db
      .query("skills")
      .withIndex("by_rfs", (query) => query.eq("rfsId", rfs._id))
      .unique();
    return buildDetail(ctx, rfs, skill ?? undefined);
  },
});
