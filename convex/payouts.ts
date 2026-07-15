import { ConvexError, v } from "convex/values";

import { mutation, type MutationCtx } from "./_generated/server";
import { authComponent } from "./auth";

const requireAuthedUser = async (ctx: MutationCtx) => {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return user;
};

export const claimPayout = mutation({
  args: {
    rfsId: v.id("rfs"),
    claimGroupId: v.string(),
  },
  returns: v.object({
    rfsId: v.id("rfs"),
    claimedAmountBaseUnits: v.int64(),
    status: v.literal("claimed"),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);
    const callerUserId = user._id;
    const walletAddress =
      "walletAddress" in user && typeof user.walletAddress === "string"
        ? user.walletAddress.trim()
        : "";

    const rfs = await ctx.db.get(args.rfsId);
    if (!rfs) {
      throw new ConvexError({ code: "NOT_FOUND", message: "RFS not found." });
    }
    if (rfs.claimantUserId !== callerUserId) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only the claimant can claim payout for this RFS.",
      });
    }
    if (rfs.status !== "published") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Payout can only be claimed after publication.",
      });
    }
    if (!walletAddress) {
      throw new ConvexError({
        code: "INVALID_WALLET_ADDRESS",
        message: "Link a wallet address before claiming payout.",
      });
    }

    const payoutLedger = await ctx.db
      .query("payoutLedger")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .first();
    if (!payoutLedger) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Payout ledger not found." });
    }

    if (payoutLedger.status === "claimed") {
      if (payoutLedger.receiptReference !== args.claimGroupId) {
        throw new ConvexError({
          code: "INVALID_STATE",
          message: "Payout has already been claimed with a different claim group.",
        });
      }

      const alreadyClaimedEntries = await ctx.db
        .query("payoutEntries")
        .withIndex("by_claimGroup", (q) => q.eq("claimGroupId", args.claimGroupId))
        .collect();
      const claimedAmountBaseUnits = alreadyClaimedEntries
        .filter((entry) => entry.rfsId === rfs._id && entry.status === "claimed")
        .reduce((sum, entry) => sum + entry.netAmountBaseUnits, BigInt(0));

      return {
        rfsId: rfs._id,
        claimedAmountBaseUnits:
          claimedAmountBaseUnits > BigInt(0)
            ? claimedAmountBaseUnits
            : payoutLedger.netAmountBaseUnits,
        status: "claimed" as const,
      };
    }

    if (payoutLedger.status !== "claimable") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Payout is not claimable.",
      });
    }

    const entriesForRfs = await ctx.db
      .query("payoutEntries")
      .withIndex("by_rfs", (q) => q.eq("rfsId", rfs._id))
      .collect();
    const claimableEntries = entriesForRfs.filter((entry) => entry.status === "claimable");

    let claimedAmountBaseUnits = BigInt(0);
    for (const entry of claimableEntries) {
      claimedAmountBaseUnits += entry.netAmountBaseUnits;
      await ctx.db.patch(entry._id, {
        status: "claimed",
        claimGroupId: args.claimGroupId,
      });
    }

    if (claimedAmountBaseUnits === BigInt(0)) {
      claimedAmountBaseUnits = payoutLedger.netAmountBaseUnits;
    }

    await ctx.db.patch(payoutLedger._id, {
      status: "claimed",
      receiptReference: args.claimGroupId,
    });

    await ctx.db.insert("paymentEvents", {
      type: "payout_claim",
      resourceId: rfs._id,
      challengeId: args.claimGroupId,
      receiptReference: args.claimGroupId,
      amountBaseUnits: claimedAmountBaseUnits,
      currencyAddress: rfs.fundingTokenAddress,
      status: "claimed",
    });

    return {
      rfsId: rfs._id,
      claimedAmountBaseUnits,
      status: "claimed" as const,
    };
  },
});
