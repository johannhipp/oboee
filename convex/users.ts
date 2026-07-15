import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";

const walletAddressValidator = /^0x[a-fA-F0-9]{40}$/;
const zeroAddress = "0x0000000000000000000000000000000000000000";

export const normalizePayoutWalletAddress = (walletAddress: string) => {
  const normalizedWalletAddress = walletAddress.trim().toLowerCase();

  if (
    !walletAddressValidator.test(normalizedWalletAddress) ||
    normalizedWalletAddress === zeroAddress
  ) {
    throw new ConvexError({
      code: "INVALID_WALLET_ADDRESS",
      message: "Wallet address must be a nonzero 0x-prefixed 40-hex string.",
    });
  }
  return normalizedWalletAddress;
};

export const sumClaimablePayoutBaseUnits = (
  rows: ReadonlyArray<{ netAmountBaseUnits: bigint; status: string }>,
) =>
  rows
    .filter((row) => row.status === "claimable")
    .reduce((sum, row) => sum + row.netAmountBaseUnits, BigInt(0));

export const updateWallet = mutation({
  args: {
    walletAddress: v.string(),
  },
  returns: v.object({
    userId: v.string(),
    walletAddress: v.string(),
  }),
  handler: async (ctx, args) => {
    const normalizedWalletAddress = normalizePayoutWalletAddress(args.walletAddress);
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const existingWallet = await ctx.db
      .query("payoutWallets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (existingWallet) {
      await ctx.db.patch(existingWallet._id, {
        walletAddress: normalizedWalletAddress,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("payoutWallets", {
        userId: user._id,
        walletAddress: normalizedWalletAddress,
        updatedAt: Date.now(),
      });
    }

    return {
      userId: user._id,
      walletAddress: normalizedWalletAddress,
    };
  },
});

export const getDashboard = query({
  args: {},
  returns: v.object({
    user: v.object({
      id: v.string(),
      name: v.string(),
      walletAddress: v.union(v.string(), v.null()),
    }),
    requests: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        status: v.union(
          v.literal("open"),
          v.literal("funded"),
          v.literal("published"),
        ),
        fundingThresholdBaseUnits: v.int64(),
        currentAmountBaseUnits: v.int64(),
      }),
    ),
    contributions: v.array(
      v.object({
        id: v.string(),
        rfsId: v.string(),
        rfsTitle: v.string(),
        amountBaseUnits: v.int64(),
      }),
    ),
    purchases: v.array(
      v.object({
        id: v.string(),
        skillId: v.string(),
        skillTitle: v.string(),
        amountBaseUnits: v.int64(),
      }),
    ),
    claimablePayoutBaseUnits: v.int64(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const [
      requests,
      contributions,
      purchases,
      payoutWallet,
      fundingPayoutRows,
      purchasePayoutRows,
    ] = await Promise.all([
      ctx.db
        .query("rfs")
        .withIndex("by_author", (q) => q.eq("authorUserId", user._id))
        .order("desc")
        .collect(),
      ctx.db
        .query("contributions")
        .withIndex("by_backer", (q) => q.eq("backerUserId", user._id))
        .order("desc")
        .collect(),
      ctx.db
        .query("purchases")
        .withIndex("by_buyer", (q) => q.eq("buyerUserId", user._id))
        .order("desc")
        .collect(),
      ctx.db
        .query("payoutWallets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique(),
      ctx.db
        .query("payoutLedger")
        .withIndex("by_researcher", (q) => q.eq("researcherUserId", user._id))
        .collect(),
      ctx.db
        .query("payoutEntries")
        .withIndex("by_researcher_status", (q) =>
          q.eq("researcherUserId", user._id).eq("status", "claimable"),
        )
        .collect(),
    ]);
    const claimablePayoutBaseUnits = sumClaimablePayoutBaseUnits([
      ...fundingPayoutRows,
      ...purchasePayoutRows,
    ]);

    const contributionRows = await Promise.all(
      contributions.map(async (contribution) => {
        const rfs = await ctx.db.get(contribution.rfsId);
        return {
          id: contribution._id,
          rfsId: contribution.rfsId,
          rfsTitle: rfs?.title ?? "Unknown RFS",
          amountBaseUnits: contribution.amountBaseUnits,
        };
      }),
    );

    const purchaseRows = await Promise.all(
      purchases.map(async (purchase) => {
        const skill = await ctx.db.get(purchase.skillId);
        const rfs = skill ? await ctx.db.get(skill.rfsId) : null;
        return {
          id: purchase._id,
          skillId: purchase.skillId,
          skillTitle: rfs?.title ?? skill?.summary ?? "Unknown Skill",
          amountBaseUnits: purchase.amountBaseUnits,
        };
      }),
    );

    return {
      user: {
        id: user._id,
        name: user.name,
        walletAddress: payoutWallet?.walletAddress ?? null,
      },
      requests: requests.map((rfs) => ({
        id: rfs._id,
        title: rfs.title,
        status: rfs.status,
        fundingThresholdBaseUnits: rfs.fundingThresholdBaseUnits,
        currentAmountBaseUnits: rfs.currentAmountBaseUnits,
      })),
      contributions: contributionRows,
      purchases: purchaseRows,
      claimablePayoutBaseUnits,
    };
  },
});

export const getViewer = query({
  args: {},
  returns: v.union(v.object({ userId: v.string() }), v.null()),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    return user ? { userId: user._id } : null;
  },
});
