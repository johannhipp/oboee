import { ConvexError } from "convex/values";

import { authComponent } from "../auth";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const walletAddressValidator = /^0x[a-fA-F0-9]{40}$/;

export const computeFeeSplit = (grossAmountBaseUnits: bigint) => {
  const platformFeeBaseUnits = grossAmountBaseUnits / BigInt(100);
  const netAmountBaseUnits = grossAmountBaseUnits - platformFeeBaseUnits;
  return { platformFeeBaseUnits, netAmountBaseUnits };
};

export const cleanTags = (tags: string[]) =>
  Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );

export const requireAuthedUserId = async (ctx: QueryCtx | MutationCtx) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return user._id;
};

export const stableContentHash = (parts: string[]) => {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  const input = parts.join("\u001f");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
};

export const getLatestSkillVersion = async (ctx: QueryCtx | MutationCtx, skillId: Id<"skills">) => {
  const versions = await ctx.db
    .query("skillVersions")
    .withIndex("by_skill", (q) => q.eq("skillId", skillId))
    .collect();
  return versions.sort((a, b) => {
    if (a.version !== b.version) {
      return b.version - a.version;
    }
    if (a._creationTime !== b._creationTime) {
      return b._creationTime - a._creationTime;
    }
    return b._id.localeCompare(a._id);
  })[0];
};

export const getLatestAssessment = async (ctx: QueryCtx | MutationCtx, rfsId: Id<"rfs">) => {
  const assessments = await ctx.db
    .query("payoutAssessments")
    .withIndex("by_rfs", (q) => q.eq("rfsId", rfsId))
    .collect();
  return assessments.sort((a, b) => {
    if (a._creationTime !== b._creationTime) {
      return b._creationTime - a._creationTime;
    }
    return b._id.localeCompare(a._id);
  })[0];
};

export const getSkillAndLatestVersion = async (ctx: QueryCtx | MutationCtx, rfsId: Id<"rfs">) => {
  const skill = await ctx.db
    .query("skills")
    .withIndex("by_rfs", (q) => q.eq("rfsId", rfsId))
    .first();
  if (!skill) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Skill not found for this RFS.",
    });
  }
  const latestVersion = await getLatestSkillVersion(ctx, skill._id);
  if (!latestVersion) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Skill version not found for this RFS.",
    });
  }
  return { skill, latestVersion };
};

export const getLatestAssessmentOrThrow = async (ctx: QueryCtx | MutationCtx, rfsId: Id<"rfs">) => {
  const assessment = await getLatestAssessment(ctx, rfsId);
  if (!assessment) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Payout assessment not found.",
    });
  }
  return assessment;
};

export const userBackedRfs = async (
  ctx: QueryCtx | MutationCtx,
  rfsId: Id<"rfs">,
  userId: string,
) => {
  const contributions = await ctx.db
    .query("contributions")
    .withIndex("by_rfs", (q) => q.eq("rfsId", rfsId))
    .collect();
  return contributions.some(
    (contribution) => contribution.status === "accepted" && contribution.backerUserId === userId,
  );
};
