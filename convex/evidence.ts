import { ed25519 } from "@noble/curves/ed25519";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { ConvexError, v } from "convex/values";

import {
  evidenceFinalizePayload,
  evidenceUploadAuthorizationPayload,
} from "../shared/authorization-envelope";
import { verifyServerEnvelope } from "../shared/server-envelope";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { POLICY_V2 } from "./lib/policy";
import { requireActiveRole, requirePrincipal } from "./lib/principals";

const uploadTtlMs = 10 * 60 * 1_000;
const sha256Pattern = /^[a-f0-9]{64}$/;
const safeMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

const serverSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Server envelope secret is not configured." });
  }
  return secret;
};

const normalizeHex = (value: string, bytes: number) => {
  const normalized = value.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new ConvexError({ code: "INVALID_PROOF", message: `Expected ${bytes} bytes of hexadecimal data.` });
  }
  return normalized;
};

export const createUploadIntent = mutation({
  args: {
    rfsId: v.id("rfs"),
    skillVersionId: v.id("skillVersions"),
    criterionId: v.optional(v.id("rfsCriteria")),
    evaluationId: v.optional(v.id("evaluationEvents")),
    mimeType: v.string(),
    expiresAt: v.number(),
    authorizationSignature: v.string(),
  },
  returns: v.object({ uploadIntentId: v.id("artifactUploadIntents"), uploadUrl: v.string(), maximumBytes: v.number(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const mimeType = args.mimeType.trim().toLowerCase();
    const now = Date.now();
    if (!safeMimeTypes.has(mimeType)) throw new ConvexError({ code: "UNSUPPORTED_MIME_TYPE", message: "Evidence MIME type is not allowed." });
    if (args.expiresAt <= now || args.expiresAt > now + uploadTtlMs + 60_000) throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Upload authorization expiry is invalid." });
    const payload = evidenceUploadAuthorizationPayload({ principalId: principal.principalId, rfsId: String(args.rfsId), skillVersionId: String(args.skillVersionId), criterionId: args.criterionId ? String(args.criterionId) : undefined, evaluationId: args.evaluationId ? String(args.evaluationId) : undefined, mimeType, expiresAt: args.expiresAt });
    if (!verifyServerEnvelope(serverSecret(), payload, args.authorizationSignature)) throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Upload authorization is invalid." });
    const [rfs, version, criterion] = await Promise.all([ctx.db.get(args.rfsId), ctx.db.get(args.skillVersionId), args.criterionId ? ctx.db.get(args.criterionId) : null]);
    if (!rfs || !version || version.rfsId !== rfs._id || rfs.policyVersion !== POLICY_V2.version || (criterion && (criterion.rfsId !== rfs._id || criterion.revisionId !== rfs.currentRevisionId))) throw new ConvexError({ code: "INVALID_EVIDENCE_SCOPE", message: "Evidence scope does not match the active contract." });
    const uploadIntentId = await ctx.db.insert("artifactUploadIntents", {
      principalId: principal.principalId, rfsId: rfs._id, skillVersionId: version._id,
      criterionId: args.criterionId, evaluationId: args.evaluationId,
      expectedMimeType: mimeType, maximumBytes: POLICY_V2.evidenceUploadLimitBytes,
      state: "issued", expiresAt: args.expiresAt, createdAt: now,
    });
    return { uploadIntentId, uploadUrl: await ctx.storage.generateUploadUrl(), maximumBytes: POLICY_V2.evidenceUploadLimitBytes, expiresAt: args.expiresAt };
  },
});

const classificationValidator = v.union(v.literal("public"), v.literal("restricted"));
const restrictionReasonValidator = v.union(v.literal("private_source"), v.literal("live_exploit"), v.literal("credentials"), v.literal("coordinated_disclosure"));

export const finalizeUpload = mutation({
  args: {
    uploadIntentId: v.id("artifactUploadIntents"), storageId: v.id("_storage"),
    classification: classificationValidator, restrictionReason: v.optional(restrictionReasonValidator),
    plaintextSha256: v.string(), ciphertextSha256: v.string(), wrappedDataKey: v.string(),
    nonce: v.string(), authenticationTag: v.string(), kmsKeyVersion: v.string(), mimeType: v.string(),
    sizeBytes: v.number(), publicRedaction: v.optional(v.string()), proofManifest: v.string(),
    proofSignature: v.string(), signingKeyId: v.id("principalSigningKeys"), envelopeSignature: v.string(),
  },
  returns: v.id("evidenceArtifacts"),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const intent = await ctx.db.get(args.uploadIntentId);
    if (!intent || intent.principalId !== principal.principalId || intent.state !== "issued" || intent.expiresAt <= Date.now()) throw new ConvexError({ code: "UPLOAD_INTENT_EXPIRED", message: "Evidence upload intent is unavailable." });
    const payload = evidenceFinalizePayload({ uploadIntentId: String(intent._id), principalId: principal.principalId, storageId: String(args.storageId), classification: args.classification, restrictionReason: args.restrictionReason, plaintextSha256: args.plaintextSha256, ciphertextSha256: args.ciphertextSha256, wrappedDataKey: args.wrappedDataKey, nonce: args.nonce, authenticationTag: args.authenticationTag, kmsKeyVersion: args.kmsKeyVersion, mimeType: args.mimeType, sizeBytes: args.sizeBytes, publicRedaction: args.publicRedaction, proofManifest: args.proofManifest, proofSignature: args.proofSignature, signingKeyId: String(args.signingKeyId) });
    if (!verifyServerEnvelope(serverSecret(), payload, args.envelopeSignature)) throw new ConvexError({ code: "INVALID_ENVELOPE", message: "Evidence metadata envelope is invalid." });
    if (args.mimeType.trim().toLowerCase() !== intent.expectedMimeType || !safeMimeTypes.has(intent.expectedMimeType) || !Number.isInteger(args.sizeBytes) || args.sizeBytes <= 0 || args.sizeBytes > intent.maximumBytes) throw new ConvexError({ code: "INVALID_ARTIFACT", message: "Encrypted artifact metadata does not match the upload intent." });
    if (!sha256Pattern.test(args.plaintextSha256) || !sha256Pattern.test(args.ciphertextSha256)) throw new ConvexError({ code: "INVALID_ARTIFACT", message: "Evidence hashes must be lowercase SHA-256 hex." });
    if (args.classification === "restricted" && (!args.restrictionReason || !args.publicRedaction?.trim())) throw new ConvexError({ code: "REDACTION_REQUIRED", message: "Restricted evidence requires a reason and public redaction." });
    if (args.classification === "public" && args.restrictionReason) throw new ConvexError({ code: "INVALID_CLASSIFICATION", message: "Public evidence cannot carry a restriction reason." });
    const key = await ctx.db.get(args.signingKeyId);
    const now = Date.now();
    if (!key || key.principalId !== principal.principalId || key.purpose !== "proof_manifest" || key.algorithm !== "ed25519" || key.activeFrom > now || (key.activeUntil !== undefined && key.activeUntil <= now) || key.revokedAt !== undefined) throw new ConvexError({ code: "INVALID_PROOF_KEY", message: "An active Ed25519 proof key is required." });
    let manifest: Record<string, unknown>;
    try { manifest = JSON.parse(args.proofManifest) as Record<string, unknown>; } catch { throw new ConvexError({ code: "INVALID_PROOF", message: "Proof manifest must be valid JSON." }); }
    if (manifest.rfsId !== String(intent.rfsId) || manifest.skillVersionId !== String(intent.skillVersionId) || manifest.criterionId !== (intent.criterionId ? String(intent.criterionId) : null) || manifest.contentSha256 !== args.plaintextSha256 || typeof manifest.fixtureDigest !== "string" || typeof manifest.runtime !== "string" || typeof manifest.toolVersions !== "object" || typeof manifest.normalizedInputs !== "object" || typeof manifest.beforeStateHash !== "string" || typeof manifest.afterStateHash !== "string" || !Array.isArray(manifest.assertions) || typeof manifest.timestamp !== "number") throw new ConvexError({ code: "INVALID_PROOF", message: "Proof manifest is not bound to the artifact and contract." });
    if (Math.abs(now - (manifest.timestamp as number)) > 24 * 60 * 60 * 1_000) throw new ConvexError({ code: "PROOF_EXPIRED", message: "Proof manifest timestamp is outside the accepted window." });
    const signature = normalizeHex(args.proofSignature, 64);
    if (!ed25519.verify(hexToBytes(signature), utf8ToBytes(args.proofManifest), hexToBytes(normalizeHex(key.publicKey, 32)), { zip215: false })) throw new ConvexError({ code: "INVALID_PROOF", message: "Proof manifest signature verification failed." });
    const duplicate = await ctx.db.query("evidenceArtifacts").filter((query) => query.and(query.eq(query.field("plaintextSha256"), args.plaintextSha256), query.eq(query.field("proofSignature"), signature))).first();
    if (duplicate) return duplicate._id;
    const artifactId = await ctx.db.insert("evidenceArtifacts", {
      ownerPrincipalId: principal.principalId, rfsId: intent.rfsId, skillVersionId: intent.skillVersionId,
      criterionId: intent.criterionId, evaluationId: intent.evaluationId, classification: args.classification,
      restrictionReason: args.restrictionReason, verificationState: "submitted", scanState: "pending",
      plaintextSha256: args.plaintextSha256, ciphertextSha256: args.ciphertextSha256,
      ciphertextStorageId: args.storageId, wrappedDataKey: args.wrappedDataKey, nonce: args.nonce,
      authenticationTag: args.authenticationTag, kmsKeyVersion: args.kmsKeyVersion,
      mimeType: intent.expectedMimeType, sizeBytes: args.sizeBytes, publicRedaction: args.publicRedaction,
      proofManifest: args.proofManifest, proofSignature: signature, signingKeyId: key._id,
      retentionDeleteAt: now + POLICY_V2.evidenceRetentionMs, legalHold: false, createdAt: now,
    });
    await ctx.db.patch(intent._id, { state: "uploaded", storageId: args.storageId });
    return artifactId;
  },
});

export const recordVerification = internalMutation({
  args: { artifactId: v.id("evidenceArtifacts"), verifierPrincipalId: v.string(), verified: v.boolean(), scanState: v.union(v.literal("clean"), v.literal("quarantined"), v.literal("failed")) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || artifact.deletedAt) return "unchanged";
    await requireActiveRole(ctx, { principalId: args.verifierPrincipalId, role: "trusted_reviewer" });
    await ctx.db.patch(artifact._id, { scanState: args.scanState, verificationState: args.verified && args.scanState === "clean" ? "verified" : "failed", verifiedByPrincipalId: args.verifierPrincipalId, verifiedAt: Date.now() });
    return args.verified && args.scanState === "clean" ? "verified" : "failed";
  },
});

const mayReadRestricted = async (ctx: QueryCtx | MutationCtx, artifact: Doc<"evidenceArtifacts">, principalId: string) => {
  if (artifact.ownerPrincipalId === principalId) return true;
  const rfs = await ctx.db.get(artifact.rfsId);
  if (rfs?.authorUserId === principalId || rfs?.claimantUserId === principalId) return true;
  const contributions = await ctx.db.query("contributions").withIndex("by_rfs", (query) => query.eq("rfsId", artifact.rfsId)).collect();
  if (contributions.some((item) => item.status === "accepted" && item.backerUserId === principalId)) return true;
  const assignments = await ctx.db.query("reviewAssignments").withIndex("by_reviewer_and_state", (query) => query.eq("reviewerPrincipalId", principalId)).collect();
  return assignments.some((assignment) => assignment.rfsId === artifact.rfsId && (assignment.state === "accepted" || assignment.state === "completed"));
};

export const authorizeDownload = mutation({
  args: { artifactId: v.id("evidenceArtifacts"), reason: v.string() },
  returns: v.union(v.null(), v.object({ storageUrl: v.string(), wrappedDataKey: v.string(), nonce: v.string(), authenticationTag: v.string(), kmsKeyVersion: v.string(), mimeType: v.string(), plaintextSha256: v.string() })),
  handler: async (ctx, args) => {
    const principal = await requirePrincipal(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    const allowed = Boolean(artifact && !artifact.deletedAt && artifact.scanState === "clean" && (artifact.classification === "public" || await mayReadRestricted(ctx, artifact, principal.principalId)));
    await ctx.db.insert("evidenceAccessEvents", { artifactId: args.artifactId, actorPrincipalId: principal.principalId, action: allowed ? "read" : "failed_read", reason: args.reason.trim() || "controlled_download", result: allowed ? "allowed" : "denied", occurredAt: Date.now() });
    if (!allowed || !artifact) return null;
    const storageUrl = await ctx.storage.getUrl(artifact.ciphertextStorageId);
    if (!storageUrl) return null;
    return { storageUrl, wrappedDataKey: artifact.wrappedDataKey, nonce: artifact.nonce, authenticationTag: artifact.authenticationTag, kmsKeyVersion: artifact.kmsKeyVersion, mimeType: artifact.mimeType, plaintextSha256: artifact.plaintextSha256 };
  },
});

export const listPublicForRfs = query({
  args: { rfsId: v.id("rfs") },
  returns: v.any(),
  handler: async (ctx, args) => (await ctx.db.query("evidenceArtifacts").withIndex("by_rfs", (query) => query.eq("rfsId", args.rfsId)).collect()).filter((artifact) => !artifact.deletedAt).map((artifact) => ({ artifactId: artifact._id, criterionId: artifact.criterionId, classification: artifact.classification, publicRedaction: artifact.publicRedaction, plaintextSha256: artifact.plaintextSha256, verificationState: artifact.verificationState, scanState: artifact.scanState, mimeType: artifact.mimeType, sizeBytes: artifact.sizeBytes, createdAt: artifact.createdAt })),
});

export const deleteExpiredRestricted = internalMutation({
  args: { now: v.optional(v.number()), limit: v.optional(v.number()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.db.query("evidenceArtifacts").withIndex("by_retentionDeleteAt", (query) => query.lte("retentionDeleteAt", now)).take(Math.min(100, args.limit ?? 50));
    let deleted = 0;
    for (const artifact of due) {
      if (artifact.classification !== "restricted" || artifact.legalHold || artifact.deletedAt) continue;
      await ctx.storage.delete(artifact.ciphertextStorageId);
      await ctx.db.patch(artifact._id, { deletedAt: now });
      await ctx.db.insert("evidenceAccessEvents", { artifactId: artifact._id, actorPrincipalId: "system:retention", action: "delete", reason: "retention_expired", result: "completed", occurredAt: now });
      deleted += 1;
    }
    return { deleted };
  },
});
