import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { requireAuthedUser } from "./lib/auth";
import { rfsStatusValidator } from "./lib/validators";
import { savePayoutWalletPreference } from "./lib/wallet";

export const sumUnsettledTestnetEarningsBaseUnits = (
  rows: ReadonlyArray<{ netAmountBaseUnits: bigint }>,
) => rows.reduce((sum, row) => sum + row.netAmountBaseUnits, BigInt(0));

export const updateWallet = mutation({
  args: {
    walletAddress: v.string(),
  },
  returns: v.object({
    userId: v.string(),
    walletAddress: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);
    const normalizedWalletAddress = await savePayoutWalletPreference(
      ctx,
      user._id,
      args.walletAddress,
    );

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
        kind: v.literal("request"),
        itemId: v.string(),
        detailHref: v.string(),
        title: v.string(),
        status: rfsStatusValidator,
        fundingThresholdBaseUnits: v.int64(),
        currentAmountBaseUnits: v.int64(),
        authorUserId: v.string(),
        authorLabel: v.string(),
        createdAt: v.number(),
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
    unsettledTestnetEarningsBaseUnits: v.int64(),
  }),
  handler: async (ctx) => {
    const user = await requireAuthedUser(ctx);

    const [
      requests,
      contributions,
      purchases,
      payoutWallet,
      earningRows,
    ] = await Promise.all([
      ctx.db
        .query("rfs")
        .withIndex("by_author", (q) => q.eq("authorUserId", user._id))
        .order("desc")
        .take(50),
      ctx.db
        .query("contributions")
        .withIndex("by_backer", (q) => q.eq("backerUserId", user._id))
        .order("desc")
        .take(50),
      ctx.db
        .query("purchases")
        .withIndex("by_buyer", (q) => q.eq("buyerUserId", user._id))
        .order("desc")
        .take(50),
      ctx.db
        .query("payoutWallets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique(),
      ctx.db
        .query("earningEntries")
        .withIndex("by_researcher_currency", (q) =>
          q.eq("researcherUserId", user._id),
        )
        .take(100),
    ]);
    const unsettledTestnetEarningsBaseUnits =
      sumUnsettledTestnetEarningsBaseUnits(earningRows);

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
        kind: "request" as const,
        itemId: rfs._id,
        detailHref: `/browse/${rfs._id}`,
        title: rfs.title,
        status: rfs.status,
        fundingThresholdBaseUnits: rfs.fundingThresholdBaseUnits,
        currentAmountBaseUnits: rfs.currentAmountBaseUnits,
        authorUserId: rfs.authorUserId,
        authorLabel: "you",
        createdAt: rfs._creationTime,
      })),
      contributions: contributionRows,
      purchases: purchaseRows,
      unsettledTestnetEarningsBaseUnits,
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
