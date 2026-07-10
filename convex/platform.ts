import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "./_generated/server";
import { requireActiveRole, requirePrincipal, requireRecentPasskey } from "./lib/principals";

const roleValidator = v.union(
  v.literal("trusted_reviewer"),
  v.literal("security_adjudicator"),
  v.literal("security_operator"),
  v.literal("platform_operator"),
);

export const bootstrapPlatformRole = internalMutation({
  args: {
    principalId: v.string(),
    role: roleValidator,
    tags: v.array(v.string()),
    activeUntil: v.number(),
    reason: v.string(),
    bootstrapActorPrincipalId: v.string(),
  },
  returns: v.id("platformRoles"),
  handler: async (ctx, args) => {
    if (args.activeUntil <= Date.now() || !args.reason.trim()) {
      throw new ConvexError({ code: "INVALID_ROLE", message: "Role expiry and reason are required." });
    }
    return await ctx.db.insert("platformRoles", {
      principalId: args.principalId,
      role: args.role,
      tags: args.tags,
      grantedByPrincipalId: args.bootstrapActorPrincipalId,
      activeFrom: Date.now(),
      activeUntil: args.activeUntil,
      reason: args.reason.trim(),
    });
  },
});

export const grantPlatformRole = mutation({
  args: {
    principalId: v.string(),
    role: roleValidator,
    tags: v.array(v.string()),
    activeUntil: v.number(),
    reason: v.string(),
  },
  returns: v.id("platformRoles"),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    if (args.activeUntil <= Date.now() || !args.reason.trim()) {
      throw new ConvexError({ code: "INVALID_ROLE", message: "Role expiry and reason are required." });
    }
    return await ctx.db.insert("platformRoles", {
      principalId: args.principalId,
      role: args.role,
      tags: [...new Set(args.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      grantedByPrincipalId: operator.principalId,
      activeFrom: Date.now(),
      activeUntil: args.activeUntil,
      reason: args.reason.trim(),
    });
  },
});
