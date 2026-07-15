import { ConvexError } from "convex/values";

import type { MutationCtx } from "./_generated/server";
import {
  assertPaymentEventCompatible,
  paymentIdempotencyConflict,
  type PaymentPrincipal,
} from "./lib/paymentBoundary";
import { fundingStateAfterContribution } from "./lib/rfsDomain";

export type ContributionPaymentArgs = {
  rfsId: string;
  amountBaseUnits: bigint;
  currencyAddress: string;
  challengeId: string;
  receiptReference: string;
};

const principalMatches = (
  row: { backerUserId?: string; anonymousPaymentReference?: string },
  principal: PaymentPrincipal,
) =>
  principal.kind === "user"
    ? row.backerUserId === principal.userId &&
      row.anonymousPaymentReference === undefined
    : row.backerUserId === undefined &&
      row.anonymousPaymentReference === principal.paymentReference;

export const applyContributionPayment = async (
  ctx: MutationCtx,
  args: ContributionPaymentArgs,
  principal: PaymentPrincipal,
) => {
  const currencyAddress = args.currencyAddress.trim().toLowerCase();
  const rfsId = ctx.db.normalizeId("rfs", args.rfsId);
  if (!rfsId) {
    throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
  }

  const expectedPaymentEvent = {
    type: "fund" as const,
    resourceId: rfsId,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress,
    status: "accepted",
  };
  const existingPaymentEvent = await ctx.db
    .query("paymentEvents")
    .withIndex("by_challengeId", (query) =>
      query.eq("challengeId", args.challengeId),
    )
    .unique();
  assertPaymentEventCompatible(existingPaymentEvent, expectedPaymentEvent);

  const existingChallenge = await ctx.db
    .query("contributions")
    .withIndex("by_challengeId", (query) =>
      query.eq("challengeId", args.challengeId),
    )
    .unique();
  if (existingChallenge) {
    const isExactRetry =
      existingChallenge.rfsId === rfsId &&
      existingChallenge.amountBaseUnits === args.amountBaseUnits &&
      existingChallenge.currencyAddress === currencyAddress &&
      existingChallenge.receiptReference === args.receiptReference &&
      principalMatches(existingChallenge, principal);
    if (!isExactRetry) {
      paymentIdempotencyConflict();
    }

    const existingRfs = await ctx.db.get(existingChallenge.rfsId);
    if (!existingRfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    if (!existingPaymentEvent) {
      await ctx.db.insert("paymentEvents", expectedPaymentEvent);
    }
    return {
      contributionId: existingChallenge._id,
      rfsNextState: existingRfs.status,
    };
  }

  if (existingPaymentEvent) {
    paymentIdempotencyConflict();
  }

  const rfs = await ctx.db.get(rfsId);
  if (!rfs) {
    throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
  }
  if (rfs.status !== "open") {
    throw new ConvexError({
      code: "INVALID_STATE",
      message: "RFS can only be funded while open.",
    });
  }
  if (currencyAddress !== rfs.fundingTokenAddress) {
    throw new ConvexError({
      code: "INVALID_CURRENCY",
      message: "Contribution currency does not match RFS funding token.",
    });
  }
  if (args.amountBaseUnits < rfs.minimumContributionBaseUnits) {
    throw new ConvexError({
      code: "INVALID_AMOUNT",
      message: "Contribution amount is below the minimum contribution.",
    });
  }

  const contributionId = await ctx.db.insert("contributions", {
    rfsId: rfs._id,
    ...(principal.kind === "user"
      ? { backerUserId: principal.userId }
      : { anonymousPaymentReference: principal.paymentReference }),
    amountBaseUnits: args.amountBaseUnits,
    currencyAddress,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    status: "accepted",
  });

  const currentAmountBaseUnits = rfs.currentAmountBaseUnits + args.amountBaseUnits;
  const rfsNextState = fundingStateAfterContribution(
    rfs.currentAmountBaseUnits,
    args.amountBaseUnits,
    rfs.fundingThresholdBaseUnits,
  );
  const thresholdCrossed = rfsNextState === "funded";

  await ctx.db.patch(rfs._id, {
    currentAmountBaseUnits,
    ...(thresholdCrossed ? { status: "funded" as const } : {}),
  });
  await ctx.db.insert("paymentEvents", expectedPaymentEvent);

  return { contributionId, rfsNextState };
};
