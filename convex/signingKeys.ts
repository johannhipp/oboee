import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requirePrincipal } from "./lib/principals";

const CHALLENGE_TTL_MS = 10 * 60 * 1_000;

const digest = (value: string) => bytesToHex(sha256(utf8ToBytes(value)));

const normalizedHex = (value: string, expectedBytes: number, label: string) => {
  const normalized = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== expectedBytes * 2) {
    throw new ConvexError({ code: "INVALID_KEY_PROOF", message: `${label} must be ${expectedBytes} bytes of hex.` });
  }
  return normalized;
};

export const createProofKeyChallenge = mutation({
  args: { publicKey: v.string() },
  returns: v.object({
    challengeId: v.id("proofKeyChallenges"),
    challenge: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const publicKey = normalizedHex(args.publicKey, 32, "Ed25519 public key");
    const createdAt = Date.now();
    const expiresAt = createdAt + CHALLENGE_TTL_MS;
    const challengeId = await ctx.db.insert("proofKeyChallenges", {
      principalId: principal.principalId,
      publicKey,
      algorithm: "ed25519",
      purpose: "proof_manifest",
      challenge: "pending",
      challengeDigest: "pending",
      state: "pending",
      expiresAt,
      createdAt,
    });
    const challenge = JSON.stringify({
      kind: "oboe_proof_key_registration",
      principalId: principal.principalId,
      publicKey,
      challengeId: String(challengeId),
      expiresAt,
    });
    await ctx.db.patch(challengeId, { challenge, challengeDigest: digest(challenge) });
    return { challengeId, challenge, expiresAt };
  },
});

export const confirmProofKeyChallenge = mutation({
  args: {
    challengeId: v.id("proofKeyChallenges"),
    challenge: v.string(),
    signature: v.string(),
  },
  returns: v.id("principalSigningKeys"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const challenge = await ctx.db.get(args.challengeId);
    if (!challenge || challenge.principalId !== principal.principalId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Proof-key challenge not found." });
    }
    if (challenge.state !== "pending" || challenge.expiresAt <= Date.now()) {
      throw new ConvexError({ code: "CHALLENGE_EXPIRED", message: "Proof-key challenge expired or was consumed." });
    }
    if (args.challenge !== challenge.challenge || digest(args.challenge) !== challenge.challengeDigest) {
      throw new ConvexError({ code: "INVALID_KEY_PROOF", message: "Challenge payload does not match." });
    }
    const signature = normalizedHex(args.signature, 64, "Ed25519 signature");
    const valid = ed25519.verify(
      hexToBytes(signature),
      utf8ToBytes(args.challenge),
      hexToBytes(challenge.publicKey),
      { zip215: false },
    );
    if (!valid) {
      throw new ConvexError({ code: "INVALID_KEY_PROOF", message: "Ed25519 signature verification failed." });
    }
    const existing = await ctx.db
      .query("principalSigningKeys")
      .withIndex("by_publicKey", (query) => query.eq("publicKey", challenge.publicKey))
      .first();
    if (existing && existing.principalId !== principal.principalId) {
      throw new ConvexError({ code: "KEY_ALREADY_LINKED", message: "Public key belongs to another principal." });
    }
    const now = Date.now();
    const keyId =
      existing?._id ??
      (await ctx.db.insert("principalSigningKeys", {
        principalId: principal.principalId,
        publicKey: challenge.publicKey,
        algorithm: "ed25519",
        purpose: "proof_manifest",
        verifiedAt: now,
        activeFrom: now,
      }));
    await ctx.db.patch(challenge._id, { state: "consumed", consumedAt: now });
    return keyId;
  },
});

export const registerVerifiedWalletAsSigningKey = mutation({
  args: { walletId: v.id("principalWallets") },
  returns: v.id("principalSigningKeys"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const wallet = await ctx.db.get(args.walletId);
    if (!wallet || wallet.principalId !== principal.principalId || wallet.status !== "active") {
      throw new ConvexError({ code: "FORBIDDEN", message: "An active verified wallet is required." });
    }
    const existing = await ctx.db
      .query("principalSigningKeys")
      .withIndex("by_publicKey", (query) => query.eq("publicKey", wallet.address))
      .first();
    if (existing) {
      return existing._id;
    }
    const now = Date.now();
    return await ctx.db.insert("principalSigningKeys", {
      principalId: principal.principalId,
      publicKey: wallet.address,
      algorithm: "eip191",
      purpose: "proof_manifest",
      verifiedAt: wallet.verifiedAt,
      activeFrom: now,
    });
  },
});

export const listMySigningKeys = query({
  args: {},
  returns: v.array(
    v.object({
      keyId: v.id("principalSigningKeys"),
      publicKey: v.string(),
      algorithm: v.union(v.literal("ed25519"), v.literal("eip191")),
      activeFrom: v.number(),
      activeUntil: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const principal = await requirePrincipal(ctx);
    const keys = await ctx.db
      .query("principalSigningKeys")
      .withIndex("by_principal_and_purpose", (query) =>
        query.eq("principalId", principal.principalId).eq("purpose", "proof_manifest"),
      )
      .collect();
    return keys.map((key) => ({
      keyId: key._id,
      publicKey: key.publicKey,
      algorithm: key.algorithm,
      activeFrom: key.activeFrom,
      activeUntil: key.activeUntil,
      revokedAt: key.revokedAt,
    }));
  },
});
