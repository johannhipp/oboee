import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { ConvexError, v } from "convex/values";

import {
  apiKeyAuthorizationPayload,
  canonicalStringList,
  delegationApprovalPayload,
  privilegedSessionPayload,
} from "../shared/authorization-envelope";
import { verifyServerEnvelope } from "../shared/server-envelope";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  assertDelegationAuthority,
  consumeDelegatedSpend,
  delegationPermissionsNarrowKey,
  isMarketplacePermission,
  releaseDelegatedSpend,
  reserveDelegatedSpend,
  type DelegationState,
  type MarketplacePermission,
} from "./lib/authorization";
import { baseUnits } from "./lib/policy";
import { transitionHumanActionOperations } from "./lib/apiOperationTransitions";
import { requirePrincipal, requireRecentPasskey, type PrincipalContext } from "./lib/principals";

const AUTHORIZATION_ENVELOPE_TTL_MS = 5 * 60 * 1_000;
const PRIVILEGED_SESSION_TTL_MS = 10 * 60 * 1_000;

const marketplacePermissionValidator = v.union(
  v.literal("rfs:read"),
  v.literal("rfs:write"),
  v.literal("fund"),
  v.literal("apply"),
  v.literal("submit"),
  v.literal("evaluate"),
  v.literal("purchase"),
  v.literal("settlement:read"),
);

const delegationBoundsValidator = {
  apiKeyId: v.string(),
  name: v.string(),
  permissions: v.array(marketplacePermissionValidator),
  actions: v.array(v.string()),
  resourceAllowlist: v.array(v.string()),
  tagAllowlist: v.array(v.string()),
  perTransactionCapBaseUnits: v.optional(v.int64()),
  rolling24HourCapBaseUnits: v.optional(v.int64()),
  lifetimeCapBaseUnits: v.optional(v.int64()),
  tokenAddress: v.optional(v.string()),
  network: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
};

type DelegationBounds = {
  apiKeyId: string;
  name: string;
  permissions: MarketplacePermission[];
  actions: string[];
  resourceAllowlist: string[];
  tagAllowlist: string[];
  perTransactionCapBaseUnits?: bigint;
  rolling24HourCapBaseUnits?: bigint;
  lifetimeCapBaseUnits?: bigint;
  tokenAddress?: string;
  network?: string;
  expiresAt?: number;
};

const serverEnvelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ConvexError({
      code: "CONFIGURATION_ERROR",
      message: "OBOE_SERVER_ENVELOPE_SECRET must contain at least 32 characters.",
    });
  }
  return secret;
};

const assertFreshEnvelope = (issuedAt: number) => {
  const age = Date.now() - issuedAt;
  if (age < -60_000 || age > AUTHORIZATION_ENVELOPE_TTL_MS) {
    throw new ConvexError({ code: "EXPIRED_ENVELOPE", message: "Authorization envelope has expired." });
  }
};

const digest = (payload: string) => bytesToHex(sha256(utf8ToBytes(payload)));

const canonicalDelegationPayload = (principalId: string, bounds: DelegationBounds) =>
  delegationApprovalPayload({
    principalId,
    apiKeyId: bounds.apiKeyId,
    permissions: bounds.permissions,
    actions: bounds.actions,
    resourceAllowlist: bounds.resourceAllowlist,
    tagAllowlist: bounds.tagAllowlist,
    perTransactionCapBaseUnits: bounds.perTransactionCapBaseUnits,
    rolling24HourCapBaseUnits: bounds.rolling24HourCapBaseUnits,
    lifetimeCapBaseUnits: bounds.lifetimeCapBaseUnits,
    tokenAddress: bounds.tokenAddress,
    network: bounds.network,
    expiresAt: bounds.expiresAt,
  });

const assertDelegationBounds = (bounds: DelegationBounds) => {
  if (!bounds.name.trim() || bounds.actions.length === 0 || bounds.permissions.length === 0) {
    throw new ConvexError({ code: "INVALID_DELEGATION", message: "Name, permissions, and actions are required." });
  }
  const caps = [
    bounds.perTransactionCapBaseUnits,
    bounds.rolling24HourCapBaseUnits,
    bounds.lifetimeCapBaseUnits,
  ].filter((value) => value !== undefined);
  if (caps.some((value) => value <= BigInt(0))) {
    throw new ConvexError({ code: "INVALID_DELEGATION", message: "Spend caps must be positive." });
  }
  if (
    bounds.perTransactionCapBaseUnits &&
    bounds.rolling24HourCapBaseUnits &&
    bounds.perTransactionCapBaseUnits > bounds.rolling24HourCapBaseUnits
  ) {
    throw new ConvexError({ code: "INVALID_DELEGATION", message: "Per-transaction cap exceeds rolling cap." });
  }
  if (
    bounds.rolling24HourCapBaseUnits &&
    bounds.lifetimeCapBaseUnits &&
    bounds.rolling24HourCapBaseUnits > bounds.lifetimeCapBaseUnits
  ) {
    throw new ConvexError({ code: "INVALID_DELEGATION", message: "Rolling cap exceeds lifetime cap." });
  }
  if (bounds.expiresAt !== undefined && bounds.expiresAt <= Date.now()) {
    throw new ConvexError({ code: "INVALID_DELEGATION", message: "Delegation expiry must be in the future." });
  }
};

const delegationState = (delegation: Doc<"agentDelegations">): DelegationState => ({
  status: delegation.status,
  permissions: delegation.permissions.filter(isMarketplacePermission),
  actions: delegation.actions,
  resourceAllowlist: delegation.resourceAllowlist,
  tagAllowlist: delegation.tagAllowlist,
  perTransactionCapBaseUnits:
    delegation.perTransactionCapBaseUnits === undefined
      ? undefined
      : baseUnits(delegation.perTransactionCapBaseUnits),
  rolling24HourCapBaseUnits:
    delegation.rolling24HourCapBaseUnits === undefined
      ? undefined
      : baseUnits(delegation.rolling24HourCapBaseUnits),
  lifetimeCapBaseUnits:
    delegation.lifetimeCapBaseUnits === undefined
      ? undefined
      : baseUnits(delegation.lifetimeCapBaseUnits),
  reservedBaseUnits: baseUnits(delegation.reservedBaseUnits),
  consumedRollingBaseUnits: baseUnits(delegation.consumedRollingBaseUnits),
  consumedLifetimeBaseUnits: baseUnits(delegation.consumedLifetimeBaseUnits),
  rollingWindowStartedAt: delegation.rollingWindowStartedAt,
  tokenAddress: delegation.tokenAddress,
  network: delegation.network,
  expiresAt: delegation.expiresAt,
});

export const registerApiKeyAuthorization = mutation({
  args: {
    apiKeyId: v.string(),
    permissions: v.array(marketplacePermissionValidator),
    issuedAt: v.number(),
    envelopeSignature: v.string(),
  },
  returns: v.id("apiKeyAuthorizations"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    assertFreshEnvelope(args.issuedAt);
    const permissions = canonicalStringList(args.permissions);
    const payload = apiKeyAuthorizationPayload({
      principalId: principal.principalId,
      apiKeyId: args.apiKeyId,
      permissions,
      issuedAt: args.issuedAt,
    });
    if (!verifyServerEnvelope(serverEnvelopeSecret(), payload, args.envelopeSignature)) {
      throw new ConvexError({ code: "INVALID_ENVELOPE", message: "API-key authorization envelope is invalid." });
    }
    const existing = await ctx.db
      .query("apiKeyAuthorizations")
      .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", args.apiKeyId))
      .unique();
    const authorizationDigest = digest(payload);
    if (existing) {
      if (existing.principalId !== principal.principalId || existing.authorizationDigest !== authorizationDigest) {
        throw new ConvexError({ code: "CONFLICT", message: "API key already has a different authorization." });
      }
      return existing._id;
    }
    return await ctx.db.insert("apiKeyAuthorizations", {
      principalId: principal.principalId,
      apiKeyId: args.apiKeyId,
      permissions,
      authorizationDigest,
      issuedAt: args.issuedAt,
      createdAt: Date.now(),
    });
  },
});

export const registerPrivilegedSession = mutation({
  args: { authenticatedAt: v.number(), envelopeSignature: v.string() },
  returns: v.id("privilegedSessionAttestations"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    assertFreshEnvelope(args.authenticatedAt);
    const payload = privilegedSessionPayload({
      principalId: principal.principalId,
      sessionId: principal.sessionId,
      authenticatedAt: args.authenticatedAt,
    });
    if (!verifyServerEnvelope(serverEnvelopeSecret(), payload, args.envelopeSignature)) {
      throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Privileged-session envelope is invalid." });
    }
    const existing = await ctx.db
      .query("privilegedSessionAttestations")
      .withIndex("by_sessionId", (query) => query.eq("sessionId", principal.sessionId))
      .unique();
    if (existing && existing.authenticatedAt >= args.authenticatedAt) {
      return existing._id;
    }
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return await ctx.db.insert("privilegedSessionAttestations", {
      principalId: principal.principalId,
      sessionId: principal.sessionId,
      authenticationMethod: "passkey",
      authenticatedAt: args.authenticatedAt,
      expiresAt: args.authenticatedAt + PRIVILEGED_SESSION_TTL_MS,
      authorizationDigest: digest(payload),
      createdAt: Date.now(),
    });
  },
});

export const registerVerifiedPasskeySession = mutation({
  args: {
    principalId: v.string(),
    sessionId: v.string(),
    authenticatedAt: v.number(),
    envelopeSignature: v.string(),
  },
  returns: v.id("privilegedSessionAttestations"),
  handler: async (ctx, args) => {
    assertFreshEnvelope(args.authenticatedAt);
    const payload = privilegedSessionPayload(args);
    if (!verifyServerEnvelope(serverEnvelopeSecret(), payload, args.envelopeSignature)) {
      throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Passkey-verification envelope is invalid." });
    }
    const existing = await ctx.db
      .query("privilegedSessionAttestations")
      .withIndex("by_sessionId", (query) => query.eq("sessionId", args.sessionId))
      .unique();
    if (existing && existing.principalId !== args.principalId) {
      throw new ConvexError({ code: "CONFLICT", message: "Session attestation belongs to another principal." });
    }
    if (existing && existing.authenticatedAt >= args.authenticatedAt) return existing._id;
    if (existing) await ctx.db.delete(existing._id);
    return await ctx.db.insert("privilegedSessionAttestations", {
      principalId: args.principalId,
      sessionId: args.sessionId,
      authenticationMethod: "passkey",
      authenticatedAt: args.authenticatedAt,
      expiresAt: args.authenticatedAt + PRIVILEGED_SESSION_TTL_MS,
      authorizationDigest: digest(payload),
      createdAt: Date.now(),
    });
  },
});

export const requestDelegationApproval = mutation({
  args: delegationBoundsValidator,
  returns: v.object({ requestId: v.id("humanActionRequests"), payloadDigest: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    assertDelegationBounds(args);
    const payload = canonicalDelegationPayload(principal.principalId, args);
    const payloadDigest = digest(payload);
    const createdAt = Date.now();
    const expiresAt = createdAt + 30 * 60 * 1_000;
    const requestId = await ctx.db.insert("humanActionRequests", {
      ownerPrincipalId: principal.principalId,
      originatingApiKeyId: args.apiKeyId,
      actionType: "grant_permission",
      resourceType: "api_key",
      resourceId: args.apiKeyId,
      payloadDigest,
      requestedBoundsJson: payload,
      reason: `Authorize bounded delegation ${args.name.trim()}.`,
      status: "pending",
      expiresAt,
      createdAt,
    });
    return { requestId, payloadDigest, expiresAt };
  },
});

export const resolveMyHumanAction = mutation({
  args: { requestId: v.id("humanActionRequests"), approve: v.boolean() },
  returns: v.union(v.literal("approved"), v.literal("declined")),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, principal);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.ownerPrincipalId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Human action request not found." });
    }
    if (request.status !== "pending" || request.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Human action request is no longer pending." });
    }
    const status = args.approve ? "approved" : "declined";
    const resolvedAt = Date.now();
    await ctx.db.patch(request._id, {
      status,
      resolvedByPrincipalId: principal.principalId,
      resolvedSessionId: principal.sessionId,
      resolvedAt,
    });
    await transitionHumanActionOperations(ctx, request._id, status, resolvedAt);
    return status;
  },
});

export const activateDelegation = mutation({
  args: { approvalRequestId: v.id("humanActionRequests"), ...delegationBoundsValidator },
  returns: v.id("agentDelegations"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    if (principal.sessionId !== args.apiKeyId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "The authorized API key must activate its own delegation." });
    }
    assertDelegationBounds(args);
    const approval = await ctx.db.get(args.approvalRequestId);
    const payload = canonicalDelegationPayload(principal.principalId, args);
    if (
      !approval ||
      approval.ownerPrincipalId !== principal.principalId ||
      approval.originatingApiKeyId !== args.apiKeyId ||
      approval.status !== "approved" ||
      approval.payloadDigest !== digest(payload)
    ) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Matching approved delegation request required." });
    }
    const keyAuthorization = await ctx.db
      .query("apiKeyAuthorizations")
      .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", args.apiKeyId))
      .unique();
    if (!keyAuthorization || keyAuthorization.principalId !== principal.principalId || keyAuthorization.revokedAt) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Active API-key authorization required." });
    }
    const keyPermissions = new Set(
      keyAuthorization.permissions.filter(isMarketplacePermission),
    );
    if (!delegationPermissionsNarrowKey(keyPermissions, args.permissions)) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Delegation cannot widen API-key permissions." });
    }
    const existing = await ctx.db
      .query("agentDelegations")
      .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", args.apiKeyId))
      .unique();
    if (existing) {
      return existing._id;
    }
    const now = Date.now();
    const delegationId = await ctx.db.insert("agentDelegations", {
      principalId: principal.principalId,
      apiKeyId: args.apiKeyId,
      name: args.name.trim(),
      permissions: canonicalStringList(args.permissions),
      actions: canonicalStringList(args.actions),
      resourceAllowlist: canonicalStringList(args.resourceAllowlist),
      tagAllowlist: canonicalStringList(args.tagAllowlist),
      perTransactionCapBaseUnits: args.perTransactionCapBaseUnits,
      rolling24HourCapBaseUnits: args.rolling24HourCapBaseUnits,
      lifetimeCapBaseUnits: args.lifetimeCapBaseUnits,
      reservedBaseUnits: BigInt(0),
      consumedRollingBaseUnits: BigInt(0),
      consumedLifetimeBaseUnits: BigInt(0),
      rollingWindowStartedAt: now,
      tokenAddress: args.tokenAddress?.trim().toLowerCase(),
      network: args.network?.trim().toLowerCase(),
      expiresAt: args.expiresAt,
      status: "active",
      createdAt: now,
    });
    await ctx.db.patch(approval._id, {
      status: "consumed",
      resolutionReference: String(delegationId),
    });
    return delegationId;
  },
});

export const requireAndReserveDelegatedSpend = async (
  ctx: MutationCtx,
  args: {
    principal: PrincipalContext;
    requiredPermission: "fund" | "purchase";
    action: string;
    resourceId: string;
    tags: readonly string[];
    tokenAddress: string;
    network: string;
    amountBaseUnits: bigint;
  },
): Promise<Id<"agentDelegations">> => {
  const authorization = await ctx.db
    .query("apiKeyAuthorizations")
    .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", args.principal.sessionId))
    .unique();
  const delegation = await ctx.db
    .query("agentDelegations")
    .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", args.principal.sessionId))
    .unique();
  if (
    !authorization ||
    authorization.principalId !== args.principal.principalId ||
    authorization.revokedAt ||
    !delegation ||
    delegation.principalId !== args.principal.principalId
  ) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Active API-key delegation required." });
  }
  const keyPermissions = new Set(
    authorization.permissions.filter(isMarketplacePermission),
  );
  const state = delegationState(delegation);
  try {
    assertDelegationAuthority(state, {
      apiKeyPermissions: keyPermissions,
      requiredPermission: args.requiredPermission,
      action: args.action,
      resourceId: args.resourceId,
      tags: args.tags,
      tokenAddress: args.tokenAddress,
      network: args.network,
      now: Date.now(),
    });
    const next = reserveDelegatedSpend(state, baseUnits(args.amountBaseUnits), Date.now());
    await ctx.db.patch(delegation._id, {
      reservedBaseUnits: next.reservedBaseUnits,
      consumedRollingBaseUnits: next.consumedRollingBaseUnits,
      rollingWindowStartedAt: next.rollingWindowStartedAt,
    });
  } catch (error) {
    throw new ConvexError({
      code: "DELEGATION_DENIED",
      message: error instanceof Error ? error.message : "Delegation denied.",
    });
  }
  return delegation._id;
};

export const releaseReservedDelegatedSpend = async (
  ctx: MutationCtx,
  delegationId: Id<"agentDelegations">,
  amountBaseUnits: bigint,
) => {
  const delegation = await ctx.db.get(delegationId);
  if (!delegation) {
    return;
  }
  const next = releaseDelegatedSpend(delegationState(delegation), baseUnits(amountBaseUnits));
  await ctx.db.patch(delegation._id, { reservedBaseUnits: next.reservedBaseUnits });
};

export const consumeReservedDelegatedSpend = async (
  ctx: MutationCtx,
  delegationId: Id<"agentDelegations">,
  amountBaseUnits: bigint,
) => {
  const delegation = await ctx.db.get(delegationId);
  if (!delegation) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Delegation not found." });
  }
  const next = consumeDelegatedSpend(delegationState(delegation), baseUnits(amountBaseUnits), Date.now());
  await ctx.db.patch(delegation._id, {
    reservedBaseUnits: next.reservedBaseUnits,
    consumedRollingBaseUnits: next.consumedRollingBaseUnits,
    consumedLifetimeBaseUnits: next.consumedLifetimeBaseUnits,
    rollingWindowStartedAt: next.rollingWindowStartedAt,
  });
};

export const listMyDelegations = query({
  args: {},
  returns: v.array(
    v.object({
      delegationId: v.id("agentDelegations"),
      apiKeyId: v.string(),
      name: v.string(),
      permissions: v.array(v.string()),
      actions: v.array(v.string()),
      reservedBaseUnits: v.int64(),
      consumedLifetimeBaseUnits: v.int64(),
      status: v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
      expiresAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const rows = await ctx.db
      .query("agentDelegations")
      .withIndex("by_principal_and_status", (query) => query.eq("principalId", principal.principalId))
      .collect();
    return rows.map((row) => ({
      delegationId: row._id,
      apiKeyId: row.apiKeyId,
      name: row.name,
      permissions: row.permissions,
      actions: row.actions,
      reservedBaseUnits: row.reservedBaseUnits,
      consumedLifetimeBaseUnits: row.consumedLifetimeBaseUnits,
      status: row.status,
      expiresAt: row.expiresAt,
    }));
  },
});

export const getMyHumanAction = query({
  args: { actionId: v.id("humanActionRequests") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const action = await ctx.db.get(args.actionId);
    if (!action || action.ownerPrincipalId !== principal.principalId) return null;
    return action;
  },
});
