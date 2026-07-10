import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { rfsStatusValidator } from "./lib/validators";

export type ConfirmedContribution = {
  paymentIntentId: Id<"paymentIntents">;
  rfsId: Id<"rfs">;
  contractRevisionId?: Id<"rfsRevisions">;
  backerPrincipalId: string;
  payerWalletId: Id<"principalWallets">;
  amountBaseUnits: bigint;
  appliedAmountBaseUnits: bigint;
  refundAmountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
  policyVersion: number;
};

export const recordConfirmedContribution = async (
  ctx: MutationCtx,
  args: ConfirmedContribution,
) => {
  const rfs = await ctx.db.get(args.rfsId);
  if (!rfs) {
    throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
  }
  const existing = await ctx.db
    .query("contributions")
    .withIndex("by_challengeId", (query) => query.eq("challengeId", args.challengeId))
    .first();
  if (existing) {
    return { contributionId: existing._id, rfsNextState: rfs.status };
  }
  const contributionId = await ctx.db.insert("contributions", {
    rfsId: rfs._id,
    backerUserId: args.backerPrincipalId,
    amountBaseUnits: args.amountBaseUnits,
    appliedAmountBaseUnits: args.appliedAmountBaseUnits,
    refundAmountBaseUnits: args.refundAmountBaseUnits,
    currencyAddress: args.currencyAddress,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    status: "accepted",
    paymentIntentId: args.paymentIntentId,
    contractRevisionId: args.contractRevisionId,
    policyVersion: args.policyVersion,
    payerWalletId: args.payerWalletId,
  });
  const currentAmountBaseUnits = rfs.currentAmountBaseUnits + args.appliedAmountBaseUnits;
  const fundingTarget = rfs.totalFundingTargetBaseUnits ?? rfs.fundingThresholdBaseUnits;
  const rfsNextState = currentAmountBaseUnits >= fundingTarget ? "funded" : rfs.status;
  await ctx.db.patch(rfs._id, {
    currentAmountBaseUnits,
    status: rfsNextState,
  });
  await ctx.db.insert("paymentEvents", {
    type: "fund",
    resourceId: rfs._id,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress: args.currencyAddress,
    status: args.refundAmountBaseUnits > BigInt(0) ? "accepted_with_refund" : "accepted",
  });
  return { contributionId, rfsNextState };
};

export const recordContribution = internalMutation({
  args: {
    paymentIntentId: v.id("paymentIntents"),
    rfsId: v.id("rfs"),
    contractRevisionId: v.optional(v.id("rfsRevisions")),
    backerPrincipalId: v.string(),
    payerWalletId: v.id("principalWallets"),
    amountBaseUnits: v.int64(),
    appliedAmountBaseUnits: v.int64(),
    refundAmountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    policyVersion: v.number(),
  },
  returns: v.object({ contributionId: v.id("contributions"), rfsNextState: rfsStatusValidator }),
  handler: recordConfirmedContribution,
});
