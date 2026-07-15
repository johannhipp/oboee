import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

const walletAddressValidator = /^0x[a-fA-F0-9]{40}$/;

export const updateWallet = mutation({
  args: {
    walletAddress: v.string(),
  },
  returns: v.object({
    userId: v.string(),
    walletAddress: v.string(),
  }),
  handler: async (ctx, args) => {
    const normalizedWalletAddress = args.walletAddress.trim().toLowerCase();

    if (!walletAddressValidator.test(normalizedWalletAddress)) {
      throw new ConvexError({
        code: "INVALID_WALLET_ADDRESS",
        message: "Wallet address must be a 0x-prefixed 40-hex string.",
      });
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const session = await auth.api.getSession({ headers });

    if (!session?.user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const updateBody: Record<string, string> = {
      walletAddress: normalizedWalletAddress,
    };

    await auth.api.updateUser({
      headers,
      body: updateBody,
    });

    return {
      userId: session.user.id,
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
          v.literal("fulfilled"),
          v.literal("published"),
          v.literal("cancelled"),
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
  }),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      });
    }

    const requests = await ctx.db
      .query("rfs")
      .withIndex("by_author", (q) => q.eq("authorUserId", user._id))
      .order("desc")
      .collect();

    const contributions = await ctx.db
      .query("contributions")
      .withIndex("by_backer", (q) => q.eq("backerUserId", user._id))
      .order("desc")
      .collect();

    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_buyer", (q) => q.eq("buyerUserId", user._id))
      .order("desc")
      .collect();

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
        walletAddress:
          "walletAddress" in user && typeof user.walletAddress === "string"
            ? user.walletAddress
            : null,
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
    };
  },
});
