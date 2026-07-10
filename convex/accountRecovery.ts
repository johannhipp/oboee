import { ConvexError, v } from "convex/values";

import { internalMutation, mutation } from "./_generated/server";
import { requireActiveRole, requirePrincipal, requireRecentPasskey } from "./lib/principals";
import { verifyWalletSignature, walletMessageDigest } from "./lib/walletProof";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const RECOVERY_COOLING_MS = 72 * 60 * 60 * 1_000;

export const createRecoveryChallenge = mutation({
  args: { principalId: v.string(), walletId: v.id("principalWallets") },
  returns: v.object({
    challengeId: v.id("accountRecoveryChallenges"),
    challenge: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.principalId !== args.principalId || wallet.status === "revoked") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Eligible recovery wallet not found." });
    }
    const createdAt = Date.now();
    const expiresAt = createdAt + CHALLENGE_TTL_MS;
    const challengeId = await ctx.db.insert("accountRecoveryChallenges", {
      principalId: args.principalId,
      walletId: wallet._id,
      challenge: "pending",
      challengeDigest: "pending",
      state: "pending",
      expiresAt,
      createdAt,
    });
    const challenge = JSON.stringify({
      kind: "oboe_account_recovery",
      principalId: args.principalId,
      walletId: String(wallet._id),
      challengeId: String(challengeId),
      expiresAt,
      statement: "Request account recovery and revoke active agent and proof keys after review.",
    });
    await ctx.db.patch(challengeId, {
      challenge,
      challengeDigest: walletMessageDigest(challenge),
    });
    return { challengeId, challenge, expiresAt };
  },
});

export const proveRecoveryWallet = mutation({
  args: {
    challengeId: v.id("accountRecoveryChallenges"),
    challenge: v.string(),
    signature: v.string(),
  },
  returns: v.object({ requestId: v.id("accountRecoveryRequests"), coolingOffUntil: v.number() }),
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.state !== "pending" || challenge.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "CHALLENGE_EXPIRED", message: "Recovery challenge expired or was consumed." });
    }
    if (
      args.challenge !== challenge.challenge ||
      walletMessageDigest(args.challenge) !== challenge.challengeDigest
    ) {
      throw new ConvexError({ code: "INVALID_SIGNATURE", message: "Recovery challenge does not match." });
    }
    const wallet = await ctx.db.get(challenge.walletId);
    if (!wallet || wallet.principalId !== challenge.principalId || wallet.status === "revoked") {
      throw new ConvexError({ code: "INVALID_SIGNATURE", message: "Recovery wallet is no longer eligible." });
    }
    if (!(await verifyWalletSignature({
      address: wallet.address,
      message: args.challenge,
      signature: args.signature,
    }))) {
      throw new ConvexError({ code: "INVALID_SIGNATURE", message: "Recovery wallet signature failed." });
    }
    const active = await ctx.db
      .query("accountRecoveryRequests")
      .withIndex("by_principal_and_status", (query) =>
        query.eq("principalId", challenge.principalId).eq("status", "pending_cooling"),
      )
      .first();
    if (active) {
      return { requestId: active._id, coolingOffUntil: active.coolingOffUntil };
    }
    const createdAt = Date.now();
    const coolingOffUntil = createdAt + RECOVERY_COOLING_MS;
    const requestId = await ctx.db.insert("accountRecoveryRequests", {
      principalId: challenge.principalId,
      priorWalletId: wallet._id,
      walletProofDigest: challenge.challengeDigest,
      status: "pending_cooling",
      coolingOffUntil,
      createdAt,
    });
    await ctx.db.patch(challenge._id, { state: "consumed", consumedAt: createdAt });
    return { requestId, coolingOffUntil };
  },
});

export const approveRecovery = mutation({
  args: { requestId: v.id("accountRecoveryRequests") },
  returns: v.object({ approvalCount: v.number(), coolingOffUntil: v.number(), ready: v.boolean() }),
  handler: async (ctx, args) => {
    const operator = await requirePrincipal(ctx);
    await requireRecentPasskey(ctx, operator);
    await requireActiveRole(ctx, {
      principalId: operator.principalId,
      role: "security_operator",
    });
    const request = await ctx.db.get(args.requestId);
    if (!request || request.status === "rejected" || request.status === "completed") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Active recovery request not found." });
    }
    if (request.principalId === operator.principalId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Recovery subject cannot approve their own request." });
    }
    if (request.firstOperatorPrincipalId === operator.principalId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "A second independent operator is required." });
    }
    const patch = request.firstOperatorPrincipalId
      ? { secondOperatorPrincipalId: operator.principalId }
      : { firstOperatorPrincipalId: operator.principalId };
    const approvalCount = request.firstOperatorPrincipalId ? 2 : 1;
    const ready = approvalCount === 2 && request.coolingOffUntil <= Date.now();
    await ctx.db.patch(request._id, {
      ...patch,
      status: ready ? "approved" : request.status,
    });
    return { approvalCount, coolingOffUntil: request.coolingOffUntil, ready };
  },
});

export const finalizeApprovedRecovery = internalMutation({
  args: { requestId: v.id("accountRecoveryRequests") },
  returns: v.object({ revokedKeyCount: v.number(), status: v.literal("completed") }),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (
      !request ||
      !request.firstOperatorPrincipalId ||
      !request.secondOperatorPrincipalId ||
      request.firstOperatorPrincipalId === request.secondOperatorPrincipalId ||
      request.coolingOffUntil > Date.now() ||
      (request.status !== "pending_cooling" &&
        request.status !== "pending_approvals" &&
        request.status !== "approved")
    ) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Recovery requirements are incomplete." });
    }
    const [authorizations, delegations, signingKeys] = await Promise.all([
      ctx.db
        .query("apiKeyAuthorizations")
        .withIndex("by_principal", (query) => query.eq("principalId", request.principalId))
        .collect(),
      ctx.db
        .query("agentDelegations")
        .withIndex("by_principal_and_status", (query) =>
          query.eq("principalId", request.principalId).eq("status", "active"),
        )
        .collect(),
      ctx.db
        .query("principalSigningKeys")
        .withIndex("by_principal_and_purpose", (query) =>
          query.eq("principalId", request.principalId).eq("purpose", "proof_manifest"),
        )
        .collect(),
    ]);
    const now = Date.now();
    let revokedKeyCount = 0;
    for (const authorization of authorizations) {
      if (!authorization.revokedAt) {
        await ctx.db.patch(authorization._id, { revokedAt: now });
        revokedKeyCount += 1;
      }
    }
    for (const delegation of delegations) {
      await ctx.db.patch(delegation._id, { status: "revoked", revokedAt: now });
    }
    for (const key of signingKeys) {
      if (!key.revokedAt) {
        await ctx.db.patch(key._id, { activeUntil: now, revokedAt: now });
        revokedKeyCount += 1;
      }
    }
    await ctx.db.patch(request._id, {
      status: "completed",
      completedAt: now,
      revokedKeyCount,
    });
    return { revokedKeyCount, status: "completed" as const };
  },
});
