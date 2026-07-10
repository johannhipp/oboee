import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";

import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query, type MutationCtx } from "./_generated/server";
import { allocateLargestRemainder, calculateSettlementPools } from "./lib/money";
import { baseUnits, basisPoints, POLICY_V2 } from "./lib/policy";
import { requirePrincipal } from "./lib/principals";

const primaryWallet = async (ctx: MutationCtx, principalId: string) => {
  const wallet = await ctx.db
    .query("principalWallets")
    .withIndex("by_principal_and_primary", (query) => query.eq("principalId", principalId).eq("primary", true))
    .unique();
  if (!wallet || wallet.status !== "active") {
    throw new ConvexError({ code: "SETTLEMENT_WALLET_REQUIRED", message: "A beneficiary lacks an active verified settlement wallet." });
  }
  return wallet;
};

const insertObligation = async (
  ctx: MutationCtx,
  args: {
    sourceType: Doc<"settlementObligations">["sourceType"];
    sourceId: string;
    beneficiaryPrincipalId: string;
    kind: Doc<"settlementObligations">["kind"];
    amountBaseUnits: bigint;
    wallet: Doc<"principalWallets">;
    tokenAddress: string;
    network: string;
    decisionReference: string;
    state?: Doc<"settlementObligations">["state"];
  },
) => {
  if (args.amountBaseUnits <= BigInt(0)) return null;
  const existing = await ctx.db
    .query("settlementObligations")
    .withIndex("by_source", (query) => query.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId))
    .collect();
  const duplicate = existing.find((item) => item.kind === args.kind && item.decisionReference === args.decisionReference);
  if (duplicate) {
    if (duplicate.amountBaseUnits !== args.amountBaseUnits || duplicate.beneficiaryPrincipalId !== args.beneficiaryPrincipalId) {
      throw new ConvexError({ code: "OBLIGATION_CONFLICT", message: "Existing obligation does not match the final decision." });
    }
    return duplicate._id;
  }
  return await ctx.db.insert("settlementObligations", {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    beneficiaryPrincipalId: args.beneficiaryPrincipalId,
    kind: args.kind,
    amountBaseUnits: args.amountBaseUnits,
    walletId: args.wallet._id,
    recipientAddressSnapshot: args.wallet.address,
    tokenAddress: args.tokenAddress,
    network: args.network,
    decisionReference: args.decisionReference,
    policyVersion: POLICY_V2.version,
    state: args.state ?? "pending",
    createdAt: Date.now(),
  });
};

export const createFinalObligations = async (
  ctx: MutationCtx,
  args: {
    assessment: Doc<"payoutAssessments">;
    rfs: Doc<"rfs">;
    finalMultiplierBps: number;
    decisionKind: "accepted" | "partial" | "rejected" | "harmful" | "abandoned";
    decisionReference: string;
    bondSlashBps?: number;
  },
) => {
  if (!args.rfs.currentRevisionId || args.rfs.policyVersion !== POLICY_V2.version) throw new ConvexError({ code: "INVALID_CONTRACT", message: "Policy-v2 contract is unavailable." });
  const existing = await ctx.db.query("settlementObligations").withIndex("by_source", (query) => query.eq("sourceType", "rfs_work").eq("sourceId", String(args.assessment._id))).collect();
  if (existing.length > 0) return existing.map((item) => item._id);
  const revision = await ctx.db.get(args.rfs.currentRevisionId);
  if (!revision) throw new ConvexError({ code: "INVALID_CONTRACT", message: "Committed contract revision not found." });
  const contributions = (await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfs._id)).collect()).filter((item) => item.status === "accepted" && (item.appliedAmountBaseUnits ?? item.amountBaseUnits) > BigInt(0));
  const reviewAssignments = await ctx.db.query("reviewAssignments").withIndex("by_assessment", (query) => query.eq("assessmentId", args.assessment._id)).collect();
  const completedAssignments = reviewAssignments.filter((assignment) => assignment.state === "completed" && assignment.reviewerPrincipalId);
  const committedReviewerFees = completedAssignments.reduce((sum, assignment) => sum + assignment.reserveFeeBaseUnits, BigInt(0));
  const bond = await ctx.db.query("bondEscrows").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfs._id)).first();
  const slashBps = args.bondSlashBps ?? 0;
  const slashedBond = bond ? (bond.amountBaseUnits * BigInt(slashBps)) / BigInt(10_000) : BigInt(0);
  const bondRefund = bond ? bond.amountBaseUnits - slashedBond : BigInt(0);
  const pools = calculateSettlementPools({
    workEscrow: baseUnits(revision.workEscrowBaseUnits),
    reviewReserve: baseUnits(revision.reviewReserveBaseUnits),
    finalMultiplierBps: basisPoints(args.finalMultiplierBps),
    committedReviewerFees: baseUnits(committedReviewerFees),
    slashedBond: baseUnits(slashedBond),
  });
  const ids: Id<"settlementObligations">[] = [];
  const authorWallet = await primaryWallet(ctx, args.assessment.authorUserId);
  const author = await insertObligation(ctx, { sourceType: "rfs_work", sourceId: String(args.assessment._id), beneficiaryPrincipalId: args.assessment.authorUserId, kind: "author_payout", amountBaseUnits: pools.netAuthorBaseUnits, wallet: authorWallet, tokenAddress: revision.tokenAddress, network: revision.network, decisionReference: `${args.decisionReference}:author` });
  if (author) ids.push(author);
  if (pools.platformFeeBaseUnits > BigInt(0)) {
    const platformPrincipalId = process.env.OBOE_PLATFORM_PRINCIPAL_ID?.trim();
    if (!platformPrincipalId) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Platform settlement principal is not configured." });
    const platformWallet = await primaryWallet(ctx, platformPrincipalId);
    const fee = await insertObligation(ctx, { sourceType: "rfs_work", sourceId: String(args.assessment._id), beneficiaryPrincipalId: platformPrincipalId, kind: "platform_fee", amountBaseUnits: pools.platformFeeBaseUnits, wallet: platformWallet, tokenAddress: revision.tokenAddress, network: revision.network, decisionReference: `${args.decisionReference}:platform_fee` });
    if (fee) ids.push(fee);
  }
  for (const assignment of completedAssignments) {
    const reviewerId = assignment.reviewerPrincipalId!;
    const wallet = await primaryWallet(ctx, reviewerId);
    const obligation = await insertObligation(ctx, { sourceType: "review_reserve", sourceId: String(args.assessment._id), beneficiaryPrincipalId: reviewerId, kind: "reviewer_fee", amountBaseUnits: assignment.reserveFeeBaseUnits, wallet, tokenAddress: revision.tokenAddress, network: revision.network, decisionReference: `${args.decisionReference}:review:${String(assignment._id)}` });
    if (obligation) ids.push(obligation);
  }
  const refunds = allocateLargestRemainder(
    pools.refundPoolBaseUnits,
    contributions.map((item) => ({ contributionId: String(item._id), amountBaseUnits: baseUnits(item.appliedAmountBaseUnits ?? item.amountBaseUnits) })),
  );
  const contributionById = new Map(contributions.map((item) => [String(item._id), item]));
  for (const refund of refunds) {
    const contribution = contributionById.get(refund.contributionId)!;
    const wallet = contribution.payerWalletId ? await ctx.db.get(contribution.payerWalletId) : null;
    if (!wallet || wallet.status === "revoked") throw new ConvexError({ code: "SETTLEMENT_WALLET_REQUIRED", message: "Backer refund wallet snapshot is unavailable." });
    const obligation = await insertObligation(ctx, { sourceType: "rfs_work", sourceId: String(args.assessment._id), beneficiaryPrincipalId: contribution.backerUserId, kind: "backer_refund", amountBaseUnits: refund.amountBaseUnits, wallet, tokenAddress: revision.tokenAddress, network: revision.network, decisionReference: `${args.decisionReference}:refund:${refund.contributionId}` });
    if (obligation) ids.push(obligation);
  }
  if (bond && bondRefund > BigInt(0)) {
    const wallet = await primaryWallet(ctx, bond.principalId);
    const obligation = await insertObligation(ctx, { sourceType: "bond", sourceId: String(args.assessment._id), beneficiaryPrincipalId: bond.principalId, kind: "bond_refund", amountBaseUnits: bondRefund, wallet, tokenAddress: revision.tokenAddress, network: revision.network, decisionReference: `${args.decisionReference}:bond_refund` });
    if (obligation) ids.push(obligation);
  }
  if (bond) await ctx.db.patch(bond._id, { state: slashedBond > BigInt(0) ? "slashed" : "refundable", slashBps, slashReason: args.decisionKind === "harmful" ? "harmful" : args.decisionKind === "abandoned" ? "first_abandonment" : undefined, resolvedAt: Date.now() });
  await ctx.db.patch(args.assessment._id, {
    qualityMultiplierBps: args.finalMultiplierBps,
    finalPayoutBaseUnits: pools.netAuthorBaseUnits,
    platformFeeBaseUnits: pools.platformFeeBaseUnits,
    unreleasedAmountBaseUnits: pools.refundPoolBaseUnits,
    grossAuthorBaseUnits: pools.grossAuthorBaseUnits,
    netAuthorBaseUnits: pools.netAuthorBaseUnits,
    refundPoolBaseUnits: pools.refundPoolBaseUnits,
    workflowStatus: "finalized",
    decisionKind: args.decisionKind,
    decidedAt: Date.now(),
    resolvedAt: Date.now(),
    status: args.finalMultiplierBps === 0 ? "blocked" : args.finalMultiplierBps === 10_000 ? "claimable" : "reduced",
    assessmentReason: args.decisionReference,
    resourceVersion: (args.assessment.resourceVersion ?? 1) + 1,
  });
  return ids;
};

export const preparePendingTransfers = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.id("settlementTransfers")),
  handler: async (ctx, args) => {
    const obligations = await ctx.db.query("settlementObligations").withIndex("by_state", (query) => query.eq("state", "pending")).take(Math.min(100, args.limit ?? 25));
    const ids: Id<"settlementTransfers">[] = [];
    const senderAddress = process.env.OBOE_CUSTODY_SENDER_ADDRESS?.trim().toLowerCase();
    if (!senderAddress) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Custody sender is not configured." });
    for (const obligation of obligations) {
      const existing = await ctx.db.query("settlementTransfers").withIndex("by_obligation", (query) => query.eq("obligationId", obligation._id)).first();
      if (existing) { ids.push(existing._id); continue; }
      const id = await ctx.db.insert("settlementTransfers", {
        obligationId: obligation._id, idempotencyKey: `obligation:${String(obligation._id)}`,
        network: obligation.network, tokenAddress: obligation.tokenAddress, senderAddress,
        recipientAddress: obligation.recipientAddressSnapshot, amountBaseUnits: obligation.amountBaseUnits,
        state: "pending", attempts: 0, createdAt: Date.now(),
      });
      await ctx.db.patch(obligation._id, { state: "queued" });
      ids.push(id);
    }
    return ids;
  },
});

type TransferWorkItem = {
  transferId: Id<"settlementTransfers">;
  state: "pending" | "broadcast" | "failed";
  idempotencyKey: string;
  network: string;
  tokenAddress: string;
  senderAddress: string;
  recipientAddress: string;
  amountBaseUnits: bigint;
};

export const dueSettlementTransfers = internalQuery({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args): Promise<TransferWorkItem[]> => {
    const now = args.now ?? Date.now();
    const limit = Math.min(100, Math.max(1, args.limit ?? 25));
    const [pending, broadcast, failed] = await Promise.all([
      ctx.db.query("settlementTransfers").withIndex("by_state_and_nextAttemptAt", (query) => query.eq("state", "pending")).take(limit),
      ctx.db.query("settlementTransfers").withIndex("by_state_and_nextAttemptAt", (query) => query.eq("state", "broadcast")).take(limit),
      ctx.db.query("settlementTransfers").withIndex("by_state_and_nextAttemptAt", (query) => query.eq("state", "failed")).take(limit),
    ]);
    return [...pending, ...broadcast, ...failed]
      .filter((transfer) => transfer.nextAttemptAt === undefined || transfer.nextAttemptAt <= now)
      .sort((left, right) => left.createdAt - right.createdAt || String(left._id).localeCompare(String(right._id)))
      .slice(0, limit)
      .flatMap((transfer): TransferWorkItem[] => {
        if (transfer.state !== "pending" && transfer.state !== "broadcast" && transfer.state !== "failed") return [];
        return [{
          transferId: transfer._id,
          state: transfer.state,
          idempotencyKey: transfer.idempotencyKey,
          network: transfer.network,
          tokenAddress: transfer.tokenAddress,
          senderAddress: transfer.senderAddress,
          recipientAddress: transfer.recipientAddress,
          amountBaseUnits: transfer.amountBaseUnits,
        }];
      });
  },
});

export const recordTransferFailure = internalMutation({
  args: { transferId: v.id("settlementTransfers"), errorCode: v.string(), now: v.optional(v.number()) },
  returns: v.object({ state: v.string(), nextAttemptAt: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer || transfer.state === "confirmed" || transfer.state === "cancelled") {
      return { state: transfer?.state ?? "missing", nextAttemptAt: transfer?.nextAttemptAt };
    }
    const now = args.now ?? Date.now();
    const attempts = transfer.attempts + 1;
    const delayMs = Math.min(15 * 60 * 1_000, 15_000 * 2 ** Math.min(6, attempts - 1));
    const nextAttemptAt = now + delayMs;
    await ctx.db.patch(transfer._id, {
      state: "failed",
      attempts,
      errorCode: args.errorCode.slice(0, 80),
      nextAttemptAt,
    });
    return { state: "failed", nextAttemptAt };
  },
});

const transferResultValidator = v.object({ transferId: v.id("settlementTransfers"), state: v.string() });

export const recordBroadcast = internalMutation({
  args: { transferId: v.id("settlementTransfers"), custodyNonce: v.string(), transactionHash: v.string() },
  returns: transferResultValidator,
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    if (transfer.state === "confirmed" || transfer.state === "broadcast") return { transferId: transfer._id, state: transfer.state };
    if (transfer.state !== "pending" && transfer.state !== "failed") throw new ConvexError({ code: "INVALID_STATE", message: "Transfer cannot be broadcast." });
    await ctx.db.patch(transfer._id, { state: "broadcast", custodyNonce: args.custodyNonce, transactionHash: args.transactionHash, attempts: transfer.attempts + 1, errorCode: undefined, nextAttemptAt: undefined });
    return { transferId: transfer._id, state: "broadcast" };
  },
});

export const confirmTransferReceipt = internalMutation({
  args: { transferId: v.id("settlementTransfers"), receiptJson: v.string(), network: v.string(), tokenAddress: v.string(), senderAddress: v.string(), recipientAddress: v.string(), amountBaseUnits: v.int64(), transactionHash: v.string(), confirmations: v.number(), success: v.boolean() },
  returns: transferResultValidator,
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.transferId);
    if (!transfer) throw new ConvexError({ code: "NOT_FOUND", message: "Transfer not found." });
    if (transfer.state === "confirmed") return { transferId: transfer._id, state: "confirmed" };
    const minimumConfirmations = Number(process.env.OBOE_SETTLEMENT_CONFIRMATIONS ?? "1");
    const transactionMatches = transfer.transactionHash === undefined || transfer.transactionHash === args.transactionHash;
    const matches = args.success && args.confirmations >= minimumConfirmations && transfer.network === args.network && transfer.tokenAddress.toLowerCase() === args.tokenAddress.toLowerCase() && transfer.senderAddress.toLowerCase() === args.senderAddress.toLowerCase() && transfer.recipientAddress.toLowerCase() === args.recipientAddress.toLowerCase() && transfer.amountBaseUnits === args.amountBaseUnits && transactionMatches;
    if (!matches) throw new ConvexError({ code: "INVALID_SETTLEMENT_RECEIPT", message: "Custody receipt does not match the immutable transfer." });
    const now = Date.now();
    await ctx.db.patch(transfer._id, { state: "confirmed", transactionHash: args.transactionHash, verifiedReceiptJson: args.receiptJson, confirmedAt: now });
    await ctx.db.patch(transfer.obligationId, { state: "settled", settledAt: now });
    return { transferId: transfer._id, state: "confirmed" };
  },
});

const broadcastRef = makeFunctionReference<"mutation", { transferId: Id<"settlementTransfers">; custodyNonce: string; transactionHash: string }, { transferId: Id<"settlementTransfers">; state: string }>("settlements:recordBroadcast");
const confirmRef = makeFunctionReference<"mutation", { transferId: Id<"settlementTransfers">; receiptJson: string; network: string; tokenAddress: string; senderAddress: string; recipientAddress: string; amountBaseUnits: bigint; transactionHash: string; confirmations: number; success: boolean }, { transferId: Id<"settlementTransfers">; state: string }>("settlements:confirmTransferReceipt");
const prepareRef = makeFunctionReference<"mutation", { limit?: number }, Id<"settlementTransfers">[]>("settlements:preparePendingTransfers");
const dueTransfersRef = makeFunctionReference<"query", { now?: number; limit?: number }, TransferWorkItem[]>("settlements:dueSettlementTransfers");
const broadcastTransferRef = makeFunctionReference<"action", { transferId: Id<"settlementTransfers">; transfer: Omit<TransferWorkItem, "transferId" | "state"> }, { transferId: Id<"settlementTransfers">; state: string }>("settlements:broadcastTransfer");
const reconcileTransferRef = makeFunctionReference<"action", { transferId: Id<"settlementTransfers">; idempotencyKey: string }, { transferId: Id<"settlementTransfers">; state: string }>("settlements:reconcileTransfer");
const failureRef = makeFunctionReference<"mutation", { transferId: Id<"settlementTransfers">; errorCode: string; now?: number }, { state: string; nextAttemptAt?: number }>("settlements:recordTransferFailure");

const custodyConfig = () => {
  const url = process.env.OBOE_CUSTODY_URL?.replace(/\/$/, "");
  const token = process.env.OBOE_CUSTODY_AUTH_TOKEN;
  if (!url || !token) throw new Error("Custody provider is not configured.");
  return { url, token };
};

export const broadcastTransfer = internalAction({
  args: { transferId: v.id("settlementTransfers"), transfer: v.object({ idempotencyKey: v.string(), network: v.string(), tokenAddress: v.string(), senderAddress: v.string(), recipientAddress: v.string(), amountBaseUnits: v.int64() }) },
  returns: transferResultValidator,
  handler: async (ctx, args) => {
    const { url, token } = custodyConfig();
    const response = await fetch(`${url}/v1/transfers`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": args.transfer.idempotencyKey }, body: JSON.stringify({ ...args.transfer, amountBaseUnits: args.transfer.amountBaseUnits.toString() }) });
    if (!response.ok) throw new Error(`Custody broadcast failed with ${response.status}.`);
    const result = await response.json() as { custodyNonce?: unknown; transactionHash?: unknown };
    if (typeof result.custodyNonce !== "string" || typeof result.transactionHash !== "string") throw new Error("Custody broadcast response is incomplete.");
    return await ctx.runMutation(broadcastRef, { transferId: args.transferId, custodyNonce: result.custodyNonce, transactionHash: result.transactionHash });
  },
});

export const reconcileTransfer = internalAction({
  args: { transferId: v.id("settlementTransfers"), idempotencyKey: v.string() },
  returns: transferResultValidator,
  handler: async (ctx, args) => {
    const { url, token } = custodyConfig();
    const response = await fetch(`${url}/v1/transfers/${encodeURIComponent(args.idempotencyKey)}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(`Custody reconciliation failed with ${response.status}.`);
    const receipt = await response.json() as Record<string, unknown>;
    if (typeof receipt.network !== "string" || typeof receipt.tokenAddress !== "string" || typeof receipt.senderAddress !== "string" || typeof receipt.recipientAddress !== "string" || typeof receipt.amountBaseUnits !== "string" || typeof receipt.transactionHash !== "string" || typeof receipt.confirmations !== "number" || typeof receipt.success !== "boolean" || !/^\d+$/.test(receipt.amountBaseUnits)) throw new Error("Custody receipt is incomplete.");
    return await ctx.runMutation(confirmRef, { transferId: args.transferId, receiptJson: JSON.stringify(receipt), network: receipt.network, tokenAddress: receipt.tokenAddress, senderAddress: receipt.senderAddress, recipientAddress: receipt.recipientAddress, amountBaseUnits: BigInt(receipt.amountBaseUnits), transactionHash: receipt.transactionHash, confirmations: receipt.confirmations, success: receipt.success });
  },
});

export const processSettlementOutbox = internalAction({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ prepared: v.number(), processed: v.number(), confirmed: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const limit = Math.min(100, Math.max(1, args.limit ?? 25));
    const prepared = await ctx.runMutation(prepareRef, { limit });
    const transfers = await ctx.runQuery(dueTransfersRef, { now, limit });
    let confirmed = 0;
    let failed = 0;
    for (const item of transfers) {
      try {
        if (item.state === "pending" || item.state === "failed") {
          try {
            await ctx.runAction(broadcastTransferRef, {
              transferId: item.transferId,
              transfer: {
                idempotencyKey: item.idempotencyKey,
                network: item.network,
                tokenAddress: item.tokenAddress,
                senderAddress: item.senderAddress,
                recipientAddress: item.recipientAddress,
                amountBaseUnits: item.amountBaseUnits,
              },
            });
          } catch {
            // A timeout or lost response can still mean the provider accepted
            // the immutable idempotency key, so reconcile before recording failure.
          }
        }
        const result = await ctx.runAction(reconcileTransferRef, {
          transferId: item.transferId,
          idempotencyKey: item.idempotencyKey,
        });
        if (result.state === "confirmed") confirmed += 1;
      } catch (error) {
        failed += 1;
        await ctx.runMutation(failureRef, {
          transferId: item.transferId,
          errorCode: error instanceof Error ? error.message : "provider_or_receipt_unavailable",
          now,
        });
      }
    }
    return { prepared: prepared.length, processed: transfers.length, confirmed, failed };
  },
});

export const myObligations = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const obligations = await ctx.db.query("settlementObligations").withIndex("by_beneficiary_and_state", (query) => query.eq("beneficiaryPrincipalId", principal.principalId)).collect();
    return await Promise.all(obligations.map(async (obligation) => ({ obligation, transfer: await ctx.db.query("settlementTransfers").withIndex("by_obligation", (query) => query.eq("obligationId", obligation._id)).first() })));
  },
});

export const getRfsSettlement = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const assessment = await ctx.db.query("payoutAssessments").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfsId)).first();
    if (!assessment) return null;
    const obligations = await ctx.db.query("settlementObligations").withIndex("by_source", (query) => query.eq("sourceType", "rfs_work").eq("sourceId", String(assessment._id))).collect();
    return {
      assessment: {
        status: assessment.status,
        workflowStatus: assessment.workflowStatus,
        decisionKind: assessment.decisionKind,
        passedWeightBps: assessment.passedWeightBps,
        grossAmountBaseUnits: assessment.grossAmountBaseUnits,
        finalPayoutBaseUnits: assessment.finalPayoutBaseUnits,
        platformFeeBaseUnits: assessment.platformFeeBaseUnits,
        refundPoolBaseUnits: assessment.refundPoolBaseUnits,
        assessmentReason: assessment.assessmentReason,
        decidedAt: assessment.decidedAt,
      },
      obligations: obligations.map((item) => ({ kind: item.kind, amountBaseUnits: item.amountBaseUnits, state: item.state })),
    };
  },
});
