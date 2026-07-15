import { ConvexError, v } from "convex/values";

import { mutation } from "./_generated/server";
import { authComponent } from "./auth";

const rfsStatusValidator = v.union(
  v.literal("open"),
  v.literal("funded"),
  v.literal("fulfilled"),
  v.literal("published"),
  v.literal("cancelled"),
);

export const recordContribution = mutation({
  args: {
    rfsId: v.id("rfs"),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
  },
  returns: v.object({
    contributionId: v.id("contributions"),
    rfsNextState: rfsStatusValidator,
    backerUserId: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    const backerUserId = user?._id ?? `agent:${args.challengeId.slice(0, 18)}`;

    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    if (rfs.status !== "open") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "RFS can only be funded while open.",
      });
    }

    const currencyAddress = args.currencyAddress.trim().toLowerCase();
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

    const existingChallenge = await ctx.db
      .query("contributions")
      .withIndex("by_challengeId", (q) => q.eq("challengeId", args.challengeId))
      .first();
    if (existingChallenge) {
      throw new ConvexError({
        code: "INVALID_CHALLENGE",
        message: "Challenge has already been consumed.",
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

    await ctx.db.insert("paymentEvents", {
      type: "fund",
      resourceId: rfs._id,
      challengeId: args.challengeId,
      receiptReference: args.receiptReference,
      amountBaseUnits: args.amountBaseUnits,
      currencyAddress,
      status: "accepted",
    });

    return {
      contributionId,
      rfsNextState,
      backerUserId,
    };
  },
});
