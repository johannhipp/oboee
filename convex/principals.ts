import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getOrCreatePrincipalCluster, requirePrincipal } from "./lib/principals";
import {
  createWalletVerificationMessage,
  normalizeEvmAddress,
  verifyWalletSignature,
  walletMessageDigest,
} from "./lib/walletProof";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;

const publicSite = () => {
  const configured = process.env.OBOE_PUBLIC_URL?.trim() ?? process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "OBOE_PUBLIC_URL is required." });
  }
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Wallet verification requires an HTTPS public URL." });
  }
  return url;
};

const normalizeAddressOrThrow = (address: string) => {
  try {
    return normalizeEvmAddress(address);
  } catch {
    throw new ConvexError({ code: "INVALID_WALLET_ADDRESS", message: "A valid EVM address is required." });
  }
};

export const ensureMyPrincipal = mutation({
  args: {},
  returns: v.object({ principalId: v.string(), identityClusterId: v.id("identityClusters") }),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const identityClusterId = await getOrCreatePrincipalCluster(ctx, principal.principalId);
    return { principalId: principal.principalId, identityClusterId };
  },
});

export const createWalletChallenge = mutation({
  args: {
    address: v.string(),
    chainId: v.number(),
  },
  returns: v.object({
    challengeId: v.id("walletVerificationChallenges"),
    address: v.string(),
    message: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.chainId) || args.chainId <= 0) {
      throw new ConvexError({ code: "INVALID_CHAIN", message: "A positive integer chain ID is required." });
    }
    const principal = await requirePrincipal(ctx);
    const address = normalizeAddressOrThrow(args.address);
    const site = publicSite();
    const createdAt = Date.now();
    const expiresAt = createdAt + CHALLENGE_TTL_MS;
    const challengeId = await ctx.db.insert("walletVerificationChallenges", {
      principalId: principal.principalId,
      chain: "eip155",
      chainId: args.chainId,
      address,
      nonce: "pending",
      domain: site.host,
      uri: site.origin,
      message: "pending",
      messageDigest: "pending",
      state: "pending",
      expiresAt,
      createdAt,
    });
    const nonce = String(challengeId).replaceAll(/[^a-zA-Z0-9]/g, "").slice(-24);
    if (nonce.length < 8) {
      throw new ConvexError({ code: "INTERNAL_ERROR", message: "Unable to create a wallet challenge nonce." });
    }
    const message = createWalletVerificationMessage({
      address,
      chainId: args.chainId,
      domain: site.host,
      nonce,
      uri: site.origin,
      issuedAt: new Date(createdAt),
      expirationTime: new Date(expiresAt),
    });
    await ctx.db.patch(challengeId, { nonce, message, messageDigest: walletMessageDigest(message) });
    return { challengeId, address, message, expiresAt };
  },
});

export const confirmWalletChallenge = mutation({
  args: {
    challengeId: v.id("walletVerificationChallenges"),
    message: v.string(),
    signature: v.string(),
    makePrimary: v.boolean(),
  },
  returns: v.object({ walletId: v.id("principalWallets"), address: v.string(), primary: v.boolean() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.principalId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Wallet challenge not found." });
    }
    if (challenge.state !== "pending" || challenge.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "CHALLENGE_EXPIRED", message: "Wallet challenge has expired or was consumed." });
    }
    if (args.message !== challenge.message || walletMessageDigest(args.message) !== challenge.messageDigest) {
      throw new ConvexError({ code: "INVALID_SIGNATURE", message: "Signed message does not match the issued challenge." });
    }
    if (!(await verifyWalletSignature({
      address: challenge.address,
      message: args.message,
      signature: args.signature,
    }))) {
      throw new ConvexError({ code: "INVALID_SIGNATURE", message: "Wallet signature verification failed." });
    }

    const existing = await ctx.db
      .query("principalWallets")
      .withIndex("by_chain_and_address", (query) =>
        query.eq("chain", challenge.chain).eq("address", challenge.address),
      )
      .first();
    if (existing && existing.principalId !== principal.principalId) {
      throw new ConvexError({ code: "WALLET_ALREADY_LINKED", message: "Wallet is linked to another principal." });
    }

    const now = Date.now();
    const currentPrimary = await ctx.db
      .query("principalWallets")
      .withIndex("by_principal_and_primary", (query) =>
        query.eq("principalId", principal.principalId).eq("primary", true),
      )
      .first();
    const primary = args.makePrimary || !currentPrimary || currentPrimary._id === existing?._id;
    if (primary && currentPrimary && currentPrimary._id !== existing?._id) {
      await ctx.db.patch(currentPrimary._id, {
        primary: false,
        status: "rotated",
        rotatedAt: now,
      });
    }

    let walletId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        verificationChallenge: String(challenge._id),
        verificationDigest: challenge.messageDigest,
        verifiedAt: now,
        primary,
        status: "active",
        rotatedAt: undefined,
        revokedAt: undefined,
      });
      walletId = existing._id;
    } else {
      walletId = await ctx.db.insert("principalWallets", {
        principalId: principal.principalId,
        chain: challenge.chain,
        address: challenge.address,
        verificationChallenge: String(challenge._id),
        verificationDigest: challenge.messageDigest,
        verifiedAt: now,
        primary,
        status: "active",
      });
    }
    await getOrCreatePrincipalCluster(ctx, principal.principalId);
    await ctx.db.patch(challenge._id, { state: "consumed", consumedAt: now });
    return { walletId, address: challenge.address, primary };
  },
});

export const listMyWallets = query({
  args: {},
  returns: v.array(
    v.object({
      walletId: v.id("principalWallets"),
      chain: v.string(),
      address: v.string(),
      verifiedAt: v.number(),
      primary: v.boolean(),
      status: v.union(v.literal("active"), v.literal("rotated"), v.literal("revoked")),
    }),
  ),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const wallets = await ctx.db
      .query("principalWallets")
      .withIndex("by_principal", (query) => query.eq("principalId", principal.principalId))
      .collect();
    return wallets.map((wallet) => ({
      walletId: wallet._id,
      chain: wallet.chain,
      address: wallet.address,
      verifiedAt: wallet.verifiedAt,
      primary: wallet.primary,
      status: wallet.status,
    }));
  },
});
