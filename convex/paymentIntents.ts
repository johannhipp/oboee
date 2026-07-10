import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { ConvexError, v } from "convex/values";

import {
  paymentIntentChallengePayload,
  paymentReceiptPayload,
} from "../shared/authorization-envelope";
import { signServerEnvelope, verifyServerEnvelope } from "../shared/server-envelope";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { recordConfirmedContribution } from "./contributions";
import {
  consumeReservedDelegatedSpend,
  releaseReservedDelegatedSpend,
  requireAndReserveDelegatedSpend,
} from "./delegations";
import { baseUnits, POLICY_V2 } from "./lib/policy";
import { allocateFundingReceipt } from "./lib/paymentPolicy";
import { requirePrincipal, type PrincipalContext } from "./lib/principals";
import { recordConfirmedPurchase } from "./purchases";

const RECEIPT_ENVELOPE_TTL_MS = 5 * 60 * 1_000;

const resourceTypeValidator = v.union(
  v.literal("rfs_funding"),
  v.literal("skill_purchase"),
  v.literal("author_bond"),
);

const intentResultValidator = v.object({
  intentId: v.id("paymentIntents"),
  resourceType: resourceTypeValidator,
  resourceId: v.string(),
  skillVersionId: v.optional(v.id("skillVersions")),
  amountBaseUnits: v.int64(),
  tokenAddress: v.string(),
  network: v.string(),
  contractDigest: v.string(),
  challengeEnvelope: v.string(),
  challengeSignature: v.string(),
  expiresAt: v.number(),
});

const serverEnvelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Server envelope secret is not configured." });
  }
  return secret;
};

const digest = (value: string) => bytesToHex(sha256(utf8ToBytes(value)));

const requireMoneyPolicy = async (ctx: MutationCtx, principalId: string) => {
  if (process.env.OBOE_MONEY_WRITES_ENABLED !== "true") {
    throw new ConvexError({ code: "MONEY_WRITES_DISABLED", message: "Money-bearing writes are disabled." });
  }
  const flag = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (query) => query.eq("key", "policy_v2"))
    .unique();
  if (!flag || (flag.mode !== "on" && !(flag.mode === "cohort" && flag.cohortIds.includes(principalId)))) {
    throw new ConvexError({ code: "POLICY_V2_DISABLED", message: "Policy v2 is not enabled for this principal." });
  }
};

const requirePrimaryWallet = async (ctx: MutationCtx, principalId: string) => {
  const wallet = await ctx.db
    .query("principalWallets")
    .withIndex("by_principal_and_primary", (query) =>
      query.eq("principalId", principalId).eq("primary", true),
    )
    .unique();
  if (!wallet || wallet.status !== "active") {
    throw new ConvexError({ code: "VERIFIED_WALLET_REQUIRED", message: "An active verified primary wallet is required." });
  }
  return wallet;
};

const existingIdempotentIntent = async (
  ctx: MutationCtx,
  args: { principalId: string; action: string; idempotencyKey: string; requestDigest: string },
) => {
  const record = await ctx.db
    .query("idempotencyRecords")
    .withIndex("by_principal_action_and_key", (query) =>
      query
        .eq("principalId", args.principalId)
        .eq("action", args.action)
        .eq("idempotencyKey", args.idempotencyKey),
    )
    .unique();
  if (!record) {
    return null;
  }
  if (record.requestDigest !== args.requestDigest || !record.resultResourceId) {
    throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotency key was used for a different request." });
  }
  const intentId = ctx.db.normalizeId("paymentIntents", record.resultResourceId);
  const intent = intentId ? await ctx.db.get(intentId) : null;
  if (!intent || !intent.challengeEnvelope) {
    throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Idempotent result no longer exists." });
  }
  return intent;
};

const resultForIntent = (intent: Doc<"paymentIntents">) => {
  const separator = intent.challengeEnvelope?.lastIndexOf(".") ?? -1;
  if (separator < 1 || !intent.challengeEnvelope) {
    throw new ConvexError({ code: "INTERNAL_ERROR", message: "Payment intent challenge is incomplete." });
  }
  return {
    intentId: intent._id,
    resourceType: intent.resourceType,
    resourceId: intent.resourceId,
    skillVersionId: intent.skillVersionId,
    amountBaseUnits: intent.amountBaseUnits,
    tokenAddress: intent.tokenAddress,
    network: intent.network,
    contractDigest: intent.contractDigest,
    challengeEnvelope: intent.challengeEnvelope.slice(0, separator),
    challengeSignature: intent.challengeEnvelope.slice(separator + 1),
    expiresAt: intent.expiresAt,
  };
};

const insertIntent = async (
  ctx: MutationCtx,
  args: {
    principal: PrincipalContext;
    resourceType: "rfs_funding" | "skill_purchase";
    resourceId: string;
    skillVersionId?: Id<"skillVersions">;
    wallet: Doc<"principalWallets">;
    delegationId?: Id<"agentDelegations">;
    amountBaseUnits: bigint;
    tokenAddress: string;
    network: string;
    contractDigest: string;
    idempotencyKey: string;
    requestDigest: string;
    action: string;
  },
) => {
  const existing = await existingIdempotentIntent(ctx, {
    principalId: args.principal.principalId,
    action: args.action,
    idempotencyKey: args.idempotencyKey,
    requestDigest: args.requestDigest,
  });
  if (existing) {
    return resultForIntent(existing);
  }
  const createdAt = Date.now();
  const expiresAt = createdAt + POLICY_V2.paymentIntentReservationMs;
  const intentId = await ctx.db.insert("paymentIntents", {
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    skillVersionId: args.skillVersionId,
    principalId: args.principal.principalId,
    walletId: args.wallet._id,
    payerAddressSnapshot: args.wallet.address,
    delegationId: args.delegationId,
    tokenAddress: args.tokenAddress,
    network: args.network,
    amountBaseUnits: args.amountBaseUnits,
    contractDigest: args.contractDigest,
    state: "reserved",
    idempotencyKey: args.idempotencyKey,
    policyVersion: POLICY_V2.version,
    expiresAt,
    createdAt,
  });
  const challengeEnvelope = paymentIntentChallengePayload({
    intentId: String(intentId),
    principalId: args.principal.principalId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    skillVersionId: args.skillVersionId ? String(args.skillVersionId) : undefined,
    walletAddress: args.wallet.address,
    amountBaseUnits: args.amountBaseUnits,
    tokenAddress: args.tokenAddress,
    network: args.network,
    contractDigest: args.contractDigest,
    expiresAt,
  });
  const challengeSignature = signServerEnvelope(serverEnvelopeSecret(), challengeEnvelope);
  await ctx.db.patch(intentId, { challengeEnvelope: `${challengeEnvelope}.${challengeSignature}` });
  await ctx.db.insert("idempotencyRecords", {
    principalId: args.principal.principalId,
    apiVersion: "v2",
    action: args.action,
    idempotencyKey: args.idempotencyKey,
    requestDigest: args.requestDigest,
    resultResourceType: "paymentIntent",
    resultResourceId: String(intentId),
    expiresAt: createdAt + 24 * 60 * 60 * 1_000,
    createdAt,
  });
  return {
    intentId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    skillVersionId: args.skillVersionId,
    amountBaseUnits: args.amountBaseUnits,
    tokenAddress: args.tokenAddress,
    network: args.network,
    contractDigest: args.contractDigest,
    challengeEnvelope,
    challengeSignature,
    expiresAt,
  };
};

export const createFundingIntent = mutation({
  args: {
    rfsId: v.id("rfs"),
    amountBaseUnits: v.int64(),
    idempotencyKey: v.string(),
  },
  returns: intentResultValidator,
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireMoneyPolicy(ctx, principal.principalId);
    if (args.amountBaseUnits <= BigInt(0)) {
      throw new ConvexError({ code: "INVALID_AMOUNT", message: "Funding amount must be positive." });
    }
    const [rfs, wallet] = await Promise.all([
      ctx.db.get(args.rfsId),
      requirePrimaryWallet(ctx, principal.principalId),
    ]);
    if (!rfs || rfs.policyVersion !== POLICY_V2.version || rfs.status !== "open" || !rfs.currentRevisionId) {
      throw new ConvexError({ code: "INVALID_STATE", message: "A committed open policy-v2 RFS is required." });
    }
    if (args.amountBaseUnits < rfs.minimumContributionBaseUnits) {
      throw new ConvexError({ code: "INVALID_AMOUNT", message: "Amount is below the minimum contribution." });
    }
    const revision = await ctx.db.get(rfs.currentRevisionId);
    if (!revision || revision.status !== "committed" || revision.contractDigest !== rfs.contractDigest) {
      throw new ConvexError({ code: "INVALID_CONTRACT", message: "Committed contract revision not found." });
    }
    const reserved = rfs.reservedFundingBaseUnits ?? BigInt(0);
    const remaining = revision.totalFundingTargetBaseUnits - rfs.currentAmountBaseUnits - reserved;
    if (args.amountBaseUnits > remaining) {
      throw new ConvexError({ code: "FUNDING_CAPACITY_EXCEEDED", message: "Amount exceeds remaining funding capacity." });
    }
    const requestDigest = digest(
      JSON.stringify({ rfsId: String(rfs._id), amountBaseUnits: args.amountBaseUnits.toString() }),
    );
    const existing = await existingIdempotentIntent(ctx, {
      principalId: principal.principalId,
      action: "create_funding_intent",
      idempotencyKey: args.idempotencyKey,
      requestDigest,
    });
    if (existing) {
      return resultForIntent(existing);
    }
    const keyAuthorization = await ctx.db
      .query("apiKeyAuthorizations")
      .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", principal.sessionId))
      .unique();
    const delegationId = keyAuthorization
      ? await requireAndReserveDelegatedSpend(ctx, {
          principal,
          requiredPermission: "fund",
          action: "create_funding_intent",
          resourceId: String(rfs._id),
          tags: rfs.tags,
          tokenAddress: revision.tokenAddress,
          network: revision.network,
          amountBaseUnits: args.amountBaseUnits,
        })
      : undefined;
    await ctx.db.patch(rfs._id, { reservedFundingBaseUnits: reserved + args.amountBaseUnits });
    return await insertIntent(ctx, {
      principal,
      resourceType: "rfs_funding",
      resourceId: String(rfs._id),
      wallet,
      delegationId,
      amountBaseUnits: args.amountBaseUnits,
      tokenAddress: revision.tokenAddress,
      network: revision.network,
      contractDigest: revision.contractDigest,
      idempotencyKey: args.idempotencyKey,
      requestDigest,
      action: "create_funding_intent",
    });
  },
});

export const createPurchaseIntent = mutation({
  args: {
    skillId: v.id("skills"),
    skillVersionId: v.id("skillVersions"),
    idempotencyKey: v.string(),
  },
  returns: intentResultValidator,
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    await requireMoneyPolicy(ctx, principal.principalId);
    const [skill, version, wallet] = await Promise.all([
      ctx.db.get(args.skillId),
      ctx.db.get(args.skillVersionId),
      requirePrimaryWallet(ctx, principal.principalId),
    ]);
    if (
      !skill ||
      !version ||
      version.skillId !== skill._id ||
      skill.publishedVersionId !== version._id ||
      skill.status !== "published" ||
      skill.quarantineState === "quarantined" ||
      version.quarantineState === "quarantined"
    ) {
      throw new ConvexError({ code: "INVALID_STATE", message: "Exact published skill version is unavailable." });
    }
    const rfs = await ctx.db.get(skill.rfsId);
    const revision = rfs?.currentRevisionId ? await ctx.db.get(rfs.currentRevisionId) : null;
    if (!rfs || !revision || revision.policyVersion !== POLICY_V2.version) {
      throw new ConvexError({ code: "INVALID_CONTRACT", message: "Skill contract is unavailable." });
    }
    const requestDigest = digest(
      JSON.stringify({ skillId: String(skill._id), skillVersionId: String(version._id) }),
    );
    const existing = await existingIdempotentIntent(ctx, {
      principalId: principal.principalId,
      action: "create_purchase_intent",
      idempotencyKey: args.idempotencyKey,
      requestDigest,
    });
    if (existing) {
      return resultForIntent(existing);
    }
    const keyAuthorization = await ctx.db
      .query("apiKeyAuthorizations")
      .withIndex("by_apiKeyId", (query) => query.eq("apiKeyId", principal.sessionId))
      .unique();
    const delegationId = keyAuthorization
      ? await requireAndReserveDelegatedSpend(ctx, {
          principal,
          requiredPermission: "purchase",
          action: "create_purchase_intent",
          resourceId: String(skill._id),
          tags: skill.tags,
          tokenAddress: revision.tokenAddress,
          network: revision.network,
          amountBaseUnits: version.purchasePriceBaseUnits,
        })
      : undefined;
    return await insertIntent(ctx, {
      principal,
      resourceType: "skill_purchase",
      resourceId: String(skill._id),
      skillVersionId: version._id,
      wallet,
      delegationId,
      amountBaseUnits: version.purchasePriceBaseUnits,
      tokenAddress: revision.tokenAddress,
      network: revision.network,
      contractDigest: revision.contractDigest,
      idempotencyKey: args.idempotencyKey,
      requestDigest,
      action: "create_purchase_intent",
    });
  },
});

const releaseReservation = async (ctx: MutationCtx, intent: Doc<"paymentIntents">) => {
  if (intent.resourceType === "rfs_funding") {
    const rfsId = ctx.db.normalizeId("rfs", intent.resourceId);
    const rfs = rfsId ? await ctx.db.get(rfsId) : null;
    if (rfs) {
      const reserved = rfs.reservedFundingBaseUnits ?? BigInt(0);
      await ctx.db.patch(rfs._id, {
        reservedFundingBaseUnits:
          reserved > intent.amountBaseUnits ? reserved - intent.amountBaseUnits : BigInt(0),
      });
    }
  }
};

const createRefundObligation = async (
  ctx: MutationCtx,
  args: { intent: Doc<"paymentIntents">; amountBaseUnits: bigint; reason: string },
) => {
  if (args.amountBaseUnits <= BigInt(0)) {
    return null;
  }
  return await ctx.db.insert("settlementObligations", {
    sourceType: args.intent.resourceType === "rfs_funding" ? "rfs_work" : "purchase_batch",
    sourceId: String(args.intent._id),
    beneficiaryPrincipalId: args.intent.principalId,
    kind: "backer_refund",
    amountBaseUnits: args.amountBaseUnits,
    walletId: args.intent.walletId,
    recipientAddressSnapshot: args.intent.payerAddressSnapshot,
    tokenAddress: args.intent.tokenAddress,
    network: args.intent.network,
    decisionReference: args.reason,
    policyVersion: args.intent.policyVersion,
    state: "pending",
    createdAt: Date.now(),
  });
};

export const confirmVerifiedReceipt = mutation({
  args: {
    intentId: v.id("paymentIntents"),
    challengeId: v.string(),
    receiptReference: v.string(),
    verifiedAt: v.number(),
    receiptEnvelopeSignature: v.string(),
  },
  returns: v.object({
    intentId: v.id("paymentIntents"),
    state: v.literal("confirmed"),
    resultResourceType: v.string(),
    resultResourceId: v.string(),
    refundObligationId: v.optional(v.id("settlementObligations")),
  }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.principalId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Payment intent not found." });
    }
    if (intent.state === "confirmed") {
      if (!intent.resultResourceType || !intent.resultResourceId || intent.receiptReference !== args.receiptReference) {
        throw new ConvexError({ code: "IDEMPOTENCY_CONFLICT", message: "Intent was confirmed with another receipt." });
      }
      return {
        intentId: intent._id,
        state: "confirmed" as const,
        resultResourceType: intent.resultResourceType,
        resultResourceId: intent.resultResourceId,
        refundObligationId: undefined,
      };
    }
    const age = Date.now() - args.verifiedAt;
    if (age < -60_000 || age > RECEIPT_ENVELOPE_TTL_MS) {
      throw new ConvexError({ code: "EXPIRED_ENVELOPE", message: "Verified receipt envelope expired." });
    }
    const payload = paymentReceiptPayload({
      intentId: String(intent._id),
      principalId: intent.principalId,
      resourceType: intent.resourceType,
      resourceId: intent.resourceId,
      skillVersionId: intent.skillVersionId ? String(intent.skillVersionId) : undefined,
      amountBaseUnits: intent.amountBaseUnits,
      tokenAddress: intent.tokenAddress,
      network: intent.network,
      contractDigest: intent.contractDigest,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      verifiedAt: args.verifiedAt,
    });
    if (!verifyServerEnvelope(serverEnvelopeSecret(), payload, args.receiptEnvelopeSignature)) {
      throw new ConvexError({ code: "INVALID_RECEIPT", message: "Verified receipt envelope is invalid." });
    }
    const duplicate = await ctx.db
      .query("paymentIntents")
      .withIndex("by_challengeId", (query) => query.eq("challengeId", args.challengeId))
      .first();
    if (duplicate && duplicate._id !== intent._id) {
      throw new ConvexError({ code: "DUPLICATE_RECEIPT", message: "Payment challenge was already consumed." });
    }
    if (intent.state === "reserved" || intent.state === "challenged") {
      await releaseReservation(ctx, intent);
    }

    let resultResourceType: string;
    let resultResourceId: string;
    let refundObligationId: Id<"settlementObligations"> | undefined;
    if (intent.resourceType === "rfs_funding") {
      const rfsId = ctx.db.normalizeId("rfs", intent.resourceId);
      const rfs = rfsId ? await ctx.db.get(rfsId) : null;
      if (!rfs) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Funded RFS no longer exists." });
      }
      const target = rfs.totalFundingTargetBaseUnits ?? rfs.fundingThresholdBaseUnits;
      const { appliedAmountBaseUnits, refundAmountBaseUnits } = allocateFundingReceipt({
        fundingTargetBaseUnits: baseUnits(target),
        currentAmountBaseUnits: baseUnits(rfs.currentAmountBaseUnits),
        receiptAmountBaseUnits: baseUnits(intent.amountBaseUnits),
      });
      const contribution = await recordConfirmedContribution(ctx, {
        paymentIntentId: intent._id,
        rfsId: rfs._id,
        contractRevisionId: rfs.currentRevisionId,
        backerPrincipalId: intent.principalId,
        payerWalletId: intent.walletId,
        amountBaseUnits: intent.amountBaseUnits,
        appliedAmountBaseUnits,
        refundAmountBaseUnits,
        currencyAddress: intent.tokenAddress,
        challengeId: args.challengeId,
        receiptReference: args.receiptReference,
        policyVersion: intent.policyVersion,
      });
      resultResourceType = "contribution";
      resultResourceId = String(contribution.contributionId);
      refundObligationId =
        (await createRefundObligation(ctx, {
          intent,
          amountBaseUnits: refundAmountBaseUnits,
          reason: "late_or_over_capacity_funding_receipt",
        })) ?? undefined;
    } else if (intent.resourceType === "skill_purchase") {
      const skillId = ctx.db.normalizeId("skills", intent.resourceId);
      const skill = skillId ? await ctx.db.get(skillId) : null;
      const version = intent.skillVersionId ? await ctx.db.get(intent.skillVersionId) : null;
      if (
        !skill ||
        !version ||
        version.skillId !== skill._id ||
        skill.publishedVersionId !== version._id ||
        skill.quarantineState === "quarantined" ||
        version.quarantineState === "quarantined"
      ) {
        const obligation = await createRefundObligation(ctx, {
          intent,
          amountBaseUnits: intent.amountBaseUnits,
          reason: "skill_unavailable_after_verified_payment",
        });
        if (!obligation) {
          throw new ConvexError({ code: "INTERNAL_ERROR", message: "Refund obligation was not created." });
        }
        resultResourceType = "refundObligation";
        resultResourceId = String(obligation);
        refundObligationId = obligation;
      } else {
        const purchase = await recordConfirmedPurchase(ctx, {
          paymentIntentId: intent._id,
          skillId: skill._id,
          skillVersionId: version._id,
          buyerPrincipalId: intent.principalId,
          buyerWalletId: intent.walletId,
          amountBaseUnits: intent.amountBaseUnits,
          currencyAddress: intent.tokenAddress,
          challengeId: args.challengeId,
          receiptReference: args.receiptReference,
        });
        resultResourceType = "purchase";
        resultResourceId = String(purchase.purchaseId);
      }
    } else {
      throw new ConvexError({ code: "INVALID_STATE", message: "Bond receipts use the assignment workflow." });
    }
    if (intent.delegationId) {
      await consumeReservedDelegatedSpend(ctx, intent.delegationId, intent.amountBaseUnits);
    }
    await ctx.db.patch(intent._id, {
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      state: "confirmed",
      confirmedAt: args.verifiedAt,
      resultResourceType,
      resultResourceId,
    });
    return {
      intentId: intent._id,
      state: "confirmed" as const,
      resultResourceType,
      resultResourceId,
      refundObligationId,
    };
  },
});

export const expireIntent = internalMutation({
  args: { intentId: v.id("paymentIntents") },
  returns: v.union(v.literal("expired"), v.literal("unchanged")),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.state === "confirmed" || intent.state === "refunded" || intent.state === "expired") {
      return "unchanged" as const;
    }
    if (intent.expiresAt > Date.now()) {
      return "unchanged" as const;
    }
    await releaseReservation(ctx, intent);
    if (intent.delegationId) {
      await releaseReservedDelegatedSpend(ctx, intent.delegationId, intent.amountBaseUnits);
    }
    await ctx.db.patch(intent._id, { state: "expired" });
    return "expired" as const;
  },
});

export const getMyIntent = query({
  args: { intentId: v.id("paymentIntents") },
  returns: v.union(
    v.null(),
    v.object({
      intentId: v.id("paymentIntents"),
      resourceType: resourceTypeValidator,
      resourceId: v.string(),
      skillVersionId: v.optional(v.id("skillVersions")),
      amountBaseUnits: v.int64(),
      tokenAddress: v.string(),
      network: v.string(),
      state: v.union(
        v.literal("reserved"),
        v.literal("challenged"),
        v.literal("confirmed"),
        v.literal("expired"),
        v.literal("failed"),
        v.literal("refunded"),
      ),
      expiresAt: v.number(),
      resultResourceType: v.optional(v.string()),
      resultResourceId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.principalId !== principal.principalId) {
      return null;
    }
    return {
      intentId: intent._id,
      resourceType: intent.resourceType,
      resourceId: intent.resourceId,
      skillVersionId: intent.skillVersionId,
      amountBaseUnits: intent.amountBaseUnits,
      tokenAddress: intent.tokenAddress,
      network: intent.network,
      state: intent.state,
      expiresAt: intent.expiresAt,
      resultResourceType: intent.resultResourceType,
      resultResourceId: intent.resultResourceId,
    };
  },
});
