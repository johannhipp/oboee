import { ConvexError, v } from "convex/values";

import { internalMutation, mutation, query } from "./_generated/server";
import { recordOperatorAudit } from "./lib/operatorAudit";
import { sha256Digest } from "./lib/contracts";
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
    const roleId = await ctx.db.insert("platformRoles", {
      principalId: args.principalId,
      role: args.role,
      tags: args.tags,
      grantedByPrincipalId: args.bootstrapActorPrincipalId,
      activeFrom: Date.now(),
      activeUntil: args.activeUntil,
      reason: args.reason.trim(),
    });
    await recordOperatorAudit(ctx, { actorPrincipalId: args.bootstrapActorPrincipalId, action: "role.bootstrap", targetType: "platformRole", targetId: String(roleId), reason: args.reason, metadata: { subjectPrincipalId: args.principalId, role: args.role, tags: args.tags, activeUntil: args.activeUntil } });
    return roleId;
  },
});

const roleDigest = (role: { _id: unknown; principalId: string; role: string; tags: string[]; activeFrom: number; activeUntil: number; revokedAt?: number }) => sha256Digest({ id: String(role._id), principalId: role.principalId, role: role.role, tags: role.tags, activeFrom: role.activeFrom, activeUntil: role.activeUntil, revokedAt: role.revokedAt ?? null });

export const revokePlatformRole = mutation({
  args: { roleId: v.id("platformRoles"), reason: v.string(), expectedDigest: v.string() },
  returns: v.literal("revoked"),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    const role = await ctx.db.get(args.roleId);
    if (!role || role.revokedAt || !args.reason.trim()) throw new ConvexError({ code: "INVALID_STATE", message: "Active role and reason are required." });
    if (args.expectedDigest !== roleDigest(role)) throw new ConvexError({ code: "STALE_RESOURCE", message: "The role changed; refresh and confirm its current digest." });
    if (role.principalId === operator.principalId && role.role === "platform_operator") throw new ConvexError({ code: "FORBIDDEN", message: "Operators cannot revoke their own platform role." });
    await ctx.db.patch(role._id, { revokedAt: Date.now() });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: "role.revoke", targetType: "platformRole", targetId: String(role._id), reason: args.reason, metadata: { subjectPrincipalId: role.principalId, role: role.role } });
    return "revoked" as const;
  },
});

export const listPlatformRoles = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const operator = await requirePrincipal(ctx);
    await requireActiveRole(ctx, { principalId: operator.principalId, role: "platform_operator" });
    const rows = await ctx.db.query("platformRoles").withIndex("by_role_and_activeUntil").order("desc").take(250);
    return rows.map((role) => ({ ...role, resourceDigest: roleDigest(role) }));
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
    const roleId = await ctx.db.insert("platformRoles", {
      principalId: args.principalId,
      role: args.role,
      tags: [...new Set(args.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      grantedByPrincipalId: operator.principalId,
      activeFrom: Date.now(),
      activeUntil: args.activeUntil,
      reason: args.reason.trim(),
    });
    await recordOperatorAudit(ctx, { actorPrincipalId: operator.principalId, action: "role.grant", targetType: "platformRole", targetId: String(roleId), reason: args.reason, metadata: { subjectPrincipalId: args.principalId, role: args.role, tags: args.tags, activeUntil: args.activeUntil } });
    return roleId;
  },
});
