import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { authComponent } from "./auth";
import {
  assertPaymentEventCompatible,
  assertPaymentServerSecret,
  paymentIdempotencyConflict,
  resolvePaymentPrincipal,
} from "./lib/paymentBoundary";

const rfsStatusValidator = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("published"),
);

export const recordContribution = mutation({
  args: {
    rfsId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    principalUserId: v.optional(v.string()),
    serverSecret: v.string(),
  },
  returns: v.object({
    contributionId: v.id("contributions"),
    rfsNextState: rfsStatusValidator,
    backerUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    assertPaymentServerSecret(args.serverSecret);
    const user = await authComponent.safeGetAuthUser(ctx);
    const backerUserId = resolvePaymentPrincipal(
      user?._id,
      args.principalUserId,
      args.challengeId,
    );
    const currencyAddress = args.currencyAddress.trim().toLowerCase();
    const rfsId = ctx.db.normalizeId("rfs", args.rfsId);

    const expectedPaymentEvent = {
      type: "fund" as const,
      resourceId: args.rfsId,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      status: "accepted",
    };
    const existingPaymentEvent = await ctx.db
      .query("paymentEvents")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    assertPaymentEventCompatible(existingPaymentEvent, expectedPaymentEvent);

    const existingChallenge = await ctx.db
      .query("contributions")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    if (existingChallenge) {
      const isExactRetry =
        rfsId !== null &&
        existingChallenge.rfsId === rfsId &&
        existingChallenge.amountBaseUnits === args.amountBaseUnits &&
        existingChallenge.currencyAddress === currencyAddress &&
        existingChallenge.receiptReference === args.receiptReference &&
        existingChallenge.backerUserId === backerUserId;
      if (!isExactRetry) {
        throw new ConvexError({
          code: "IDEMPOTENCY_CONFLICT",
          message: "This payment challenge was already recorded with different facts.",
        });
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
        backerUserId: existingChallenge.backerUserId,
      };
    }

    if (existingPaymentEvent) {
      paymentIdempotencyConflict();
    }

    if (!rfsId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
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
      backerUserId,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      status: "accepted",
    });

    const currentAmountBaseUnits = rfs.currentAmountBaseUnits + args.amountBaseUnits;
    const thresholdCrossed =
      rfs.currentAmountBaseUnits < rfs.fundingThresholdBaseUnits &&
      currentAmountBaseUnits >= rfs.fundingThresholdBaseUnits;
    const rfsNextState: "open" | "funded" = thresholdCrossed ? "funded" : "open";

    await ctx.db.patch(rfs._id, {
      currentAmountBaseUnits,
      ...(thresholdCrossed ? { status: "funded" as const } : {}),
    });

    await ctx.db.insert("paymentEvents", expectedPaymentEvent);

    return {
      contributionId,
      rfsNextState,
      backerUserId,
    };
  },
});
