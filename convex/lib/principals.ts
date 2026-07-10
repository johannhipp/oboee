import { ConvexError } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent } from "../auth";

export type PrincipalContext = {
  principalId: string;
  sessionId: string;
};

export const requirePrincipal = async (ctx: QueryCtx | MutationCtx): Promise<PrincipalContext> => {
  const [user, identity] = await Promise.all([
    authComponent.safeGetAuthUser(ctx),
    ctx.auth.getUserIdentity(),
  ]);
  if (!user || !identity) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  const sessionId = typeof identity.sessionId === "string" ? identity.sessionId : "";
  if (!sessionId) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Authenticated session is missing its identifier." });
  }
  return { principalId: user._id, sessionId };
};

export const getOrCreatePrincipalCluster = async (
  ctx: MutationCtx,
  principalId: string,
): Promise<Id<"identityClusters">> => {
  const memberships = await ctx.db
    .query("identityClusterMemberships")
    .withIndex("by_principal", (query) => query.eq("principalId", principalId))
    .collect();
  const active = memberships.find((membership) => membership.activeUntil === undefined);
  if (active) {
    return active.clusterId;
  }
  const now = Date.now();
  const clusterId = await ctx.db.insert("identityClusters", {
    status: "active",
    confidenceBps: 10_000,
    reasons: ["verified_principal"],
    manualOverride: false,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("identityClusterMemberships", {
    clusterId,
    principalId,
    confidenceBps: 10_000,
    reasons: ["one_member_verified_principal"],
    activeFrom: now,
  });
  return clusterId;
};

export const requireActiveRole = async (
  ctx: QueryCtx | MutationCtx,
  args: {
    principalId: string;
    role: "trusted_reviewer" | "security_adjudicator" | "security_operator" | "platform_operator";
    requiredTags?: readonly string[];
    now?: number;
  },
) => {
  const now = args.now ?? Date.now();
  const records = await ctx.db
    .query("platformRoles")
    .withIndex("by_principal_and_role", (query) =>
      query.eq("principalId", args.principalId).eq("role", args.role),
    )
    .collect();
  const active = records.find(
    (record) =>
      record.activeFrom <= now &&
      record.activeUntil > now &&
      record.revokedAt === undefined &&
      (record.tags.length === 0 ||
        (args.requiredTags ?? []).every((tag) => record.tags.includes(tag))),
  );
  if (!active) {
    throw new ConvexError({ code: "FORBIDDEN", message: `Active ${args.role} role required.` });
  }
  return active;
};

export const requireRecentPasskey = async (
  ctx: QueryCtx | MutationCtx,
  principal: PrincipalContext,
  now = Date.now(),
) => {
  const attestation = await ctx.db
    .query("privilegedSessionAttestations")
    .withIndex("by_sessionId", (query) => query.eq("sessionId", principal.sessionId))
    .unique();
  if (
    !attestation ||
    attestation.principalId !== principal.principalId ||
    attestation.authenticationMethod !== "passkey" ||
    attestation.authenticatedAt > now ||
    attestation.expiresAt <= now
  ) {
    throw new ConvexError({
      code: "PASSKEY_REAUTH_REQUIRED",
      message: "Recent passkey authentication is required.",
    });
  }
  return attestation;
};
