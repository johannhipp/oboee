import { ConvexError } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import { normalizeEvmAddress } from "../../shared/domain/strings";

export const normalizePayoutWalletAddress = (walletAddress: string) => {
  const normalized = normalizeEvmAddress(walletAddress);
  if (!normalized) {
    throw new ConvexError({
      code: "INVALID_WALLET_ADDRESS",
      message: "Wallet address must be a nonzero 0x-prefixed 40-hex string.",
    });
  }
  return normalized;
};

export const savePayoutWalletPreference = async (
  ctx: MutationCtx,
  userId: string,
  walletAddress: string,
) => {
  const normalized = normalizePayoutWalletAddress(walletAddress);
  const existing = await ctx.db
    .query("payoutWallets")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      walletAddress: normalized,
      updatedAt: Date.now(),
    });
    return normalized;
  }
  await ctx.db.insert("payoutWallets", {
    userId,
    walletAddress: normalized,
    updatedAt: Date.now(),
  });
  return normalized;
};
