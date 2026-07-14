import { ConvexError, v } from "convex/values";

import { fixtureFinalizePayload } from "../shared/authorization-envelope";
import { verifyServerEnvelope } from "../shared/server-envelope";
import { mutation, query } from "./_generated/server";
import { requirePrincipal } from "./lib/principals";

const SHA256 = /^[a-f0-9]{64}$/;
const MAXIMUM_BYTES = 25 * 1024 * 1024;
const UPLOAD_TTL_MS = 10 * 60 * 1_000;
const ATTESTATION_TTL_MS = 5 * 60 * 1_000;

const serverSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Fixture verification signing is not configured." });
  return secret;
};

export const createUploadIntent = mutation({
  args: { visibility: v.union(v.literal("public"), v.literal("restricted")), manifestSha256: v.string(), bundleSha256: v.string(), environmentContract: v.string() },
  returns: v.object({ uploadIntentId: v.id("fixtureUploadIntents"), uploadUrl: v.string(), maximumBytes: v.number(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    if (!SHA256.test(args.manifestSha256) || !SHA256.test(args.bundleSha256) || !args.environmentContract.trim()) throw new ConvexError({ code: "INVALID_FIXTURE", message: "Fixture hashes and environment contract are required before upload." });
    const now = Date.now(); const expiresAt = now + UPLOAD_TTL_MS;
    const uploadIntentId = await ctx.db.insert("fixtureUploadIntents", { principalId: principal.principalId, visibility: args.visibility, manifestSha256: args.manifestSha256, bundleSha256: args.bundleSha256, environmentContract: args.environmentContract.trim(), maximumBytes: MAXIMUM_BYTES, state: "issued", expiresAt, createdAt: now });
    return { uploadIntentId, uploadUrl: await ctx.storage.generateUploadUrl(), maximumBytes: MAXIMUM_BYTES, expiresAt };
  },
});

export const prepareRegistration = query({
  args: { storageId: v.id("_storage"), uploadIntentId: v.id("fixtureUploadIntents") },
  returns: v.object({ storageUrl: v.string(), principalId: v.string(), bundleSha256: v.string(), sizeBytes: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const intent = await ctx.db.get(args.uploadIntentId);
    if (!intent || intent.principalId !== principal.principalId || intent.state !== "issued" || intent.expiresAt <= Date.now()) throw new ConvexError({ code: "UPLOAD_INTENT_EXPIRED", message: "Fixture upload intent is unavailable." });
    const storage = await ctx.db.system.get(args.storageId);
    const storageUrl = await ctx.storage.getUrl(args.storageId);
    if (!storage || !storageUrl || storage.size <= 0 || storage.size > intent.maximumBytes) throw new ConvexError({ code: "INVALID_FIXTURE", message: "Fixture bundle is missing or exceeds the upload limit." });
    return { storageUrl, principalId: principal.principalId, bundleSha256: intent.bundleSha256, sizeBytes: storage.size };
  },
});

export const registerVersion = mutation({
  args: {
    storageId: v.id("_storage"),
    uploadIntentId: v.id("fixtureUploadIntents"),
    verifiedAt: v.number(),
    verificationSignature: v.string(),
  },
  returns: v.object({ fixtureVersionId: v.id("fixtureVersions"), version: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const intent = await ctx.db.get(args.uploadIntentId);
    if (!intent || intent.principalId !== principal.principalId || intent.state !== "issued" || intent.expiresAt <= Date.now()) throw new ConvexError({ code: "UPLOAD_INTENT_EXPIRED", message: "Fixture upload intent is unavailable." });
    const storage = await ctx.db.system.get(args.storageId);
    if (!storage || storage.size <= 0 || storage.size > intent.maximumBytes) {
      throw new ConvexError({ code: "INVALID_FIXTURE", message: "Fixture bundle is missing or exceeds the upload limit." });
    }
    if (Math.abs(Date.now() - args.verifiedAt) > ATTESTATION_TTL_MS || !verifyServerEnvelope(serverSecret(), fixtureFinalizePayload({ uploadIntentId: String(intent._id), principalId: principal.principalId, storageId: String(args.storageId), bundleSha256: intent.bundleSha256, sizeBytes: storage.size, verifiedAt: args.verifiedAt }), args.verificationSignature)) throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Fixture byte verification is invalid or expired." });
    const duplicate = await ctx.db
      .query("fixtureVersions")
      .withIndex("by_manifestSha256", (query) => query.eq("manifestSha256", intent.manifestSha256))
      .filter((query) => query.and(query.eq(query.field("ownerPrincipalId"), principal.principalId), query.eq(query.field("bundleSha256"), intent.bundleSha256)))
      .first();
    if (duplicate) { await ctx.db.patch(intent._id, { state: "finalized", storageId: args.storageId }); return { fixtureVersionId: duplicate._id, version: duplicate.version }; }
    const prior = await ctx.db
      .query("fixtureVersions")
      .withIndex("by_owner", (query) => query.eq("ownerPrincipalId", principal.principalId))
      .order("desc")
      .first();
    const version = (prior?.version ?? 0) + 1;
    const fixtureVersionId = await ctx.db.insert("fixtureVersions", {
      ownerPrincipalId: principal.principalId,
      visibility: intent.visibility,
      version,
      manifestSha256: intent.manifestSha256,
      bundleSha256: intent.bundleSha256,
      environmentContract: intent.environmentContract,
      storageId: args.storageId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(intent._id, { state: "finalized", storageId: args.storageId });
    return { fixtureVersionId, version };
  },
});

export const getMetadata = query({
  args: { fixtureVersionId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const fixtureVersionId = ctx.db.normalizeId("fixtureVersions", args.fixtureVersionId);
    if (!fixtureVersionId) return null;
    const fixture = await ctx.db.get(fixtureVersionId);
    if (!fixture) return null;
    return { fixtureVersionId: fixture._id, visibility: fixture.visibility, version: fixture.version, manifestSha256: fixture.manifestSha256, bundleSha256: fixture.bundleSha256, environmentContract: fixture.environmentContract, createdAt: fixture.createdAt };
  },
});

export const authorizeDownload = mutation({
  args: { fixtureVersionId: v.id("fixtureVersions") },
  returns: v.union(v.null(), v.object({ storageUrl: v.string(), bundleSha256: v.string() })),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const fixture = await ctx.db.get(args.fixtureVersionId);
    if (!fixture?.storageId) return null;
    let allowed = fixture.visibility === "public" || fixture.ownerPrincipalId === principal.principalId;
    if (!allowed) {
      const criteria = await ctx.db.query("rfsCriteria").filter((query) => query.eq(query.field("fixtureVersionId"), fixture._id)).collect();
      for (const criterion of criteria) {
        const rfs = await ctx.db.get(criterion.rfsId);
        if (rfs?.authorUserId === principal.principalId || rfs?.claimantUserId === principal.principalId) { allowed = true; break; }
        const assignment = await ctx.db.query("reviewAssignments").withIndex("by_reviewer_and_state", (query) => query.eq("reviewerPrincipalId", principal.principalId)).filter((query) => query.eq(query.field("rfsId"), criterion.rfsId)).first();
        if (assignment && (assignment.state === "accepted" || assignment.state === "completed")) { allowed = true; break; }
      }
    }
    if (!allowed) throw new ConvexError({ code: "FORBIDDEN", message: "Fixture access is not granted for this principal." });
    const storageUrl = await ctx.storage.getUrl(fixture.storageId);
    return storageUrl ? { storageUrl, bundleSha256: fixture.bundleSha256 } : null;
  },
});
