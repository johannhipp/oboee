import { createHash } from "node:crypto";

import { anyApi } from "convex/server";
import { z } from "zod";

import { evidenceFinalizePayload, evidenceUploadAuthorizationPayload } from "../../../shared/authorization-envelope";
import { signServerEnvelope } from "../../../shared/server-envelope";
import { fetchPrincipalMutation, fetchPrincipalQuery } from "@/lib/api-auth";
import { createRemoteKmsProvider, decryptEvidence, encryptEvidence } from "@/lib/evidence-crypto";
import { v2Authenticated, v2ParsedCommand } from "./route";
import { v2Error, v2Success } from "./responses";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

const textField = (form: FormData, name: string, required = true) => {
  const value = form.get(name);
  if (typeof value !== "string" || (required && !value.trim())) {
    if (!required && value === null) return undefined;
    throw Object.assign(new Error(`${name} must be a non-empty text field.`), { code: "INVALID_REQUEST" });
  }
  return value.trim();
};

const envelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) throw Object.assign(new Error("Evidence envelope signing is not configured."), { code: "CONFIGURATION_ERROR" });
  return secret;
};

type EvidenceUpload = {
  bytes: Uint8Array;
  inputDigest: string;
  mimeType: string;
  skillVersionId: string;
  criterionId?: string;
  evaluationId?: string;
  classification: "public" | "restricted";
  restrictionReason?: "private_source" | "live_exploit" | "credentials" | "coordinated_disclosure";
  publicRedaction?: string;
  proofManifest: string;
  proofSignature: string;
  signingKeyId: string;
};

const parseUpload = async (request: Request): Promise<EvidenceUpload> => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_EVIDENCE_BYTES + 256 * 1024) throw Object.assign(new Error("Evidence upload exceeds 10 MiB."), { code: "PAYLOAD_TOO_LARGE" });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > MAX_EVIDENCE_BYTES) throw Object.assign(new Error("file must contain 1 byte to 10 MiB."), { code: "INVALID_REQUEST" });
  const mimeType = file.type.trim().toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) throw Object.assign(new Error("Evidence MIME type is not allowed."), { code: "UNSUPPORTED_MIME_TYPE" });
  const classification = z.enum(["public", "restricted"]).parse(textField(form, "classification"));
  const restrictionReason = z.enum(["private_source", "live_exploit", "credentials", "coordinated_disclosure"]).optional().parse(textField(form, "restrictionReason", false));
  const publicRedaction = textField(form, "publicRedaction", false);
  if (classification === "restricted" && (!restrictionReason || !publicRedaction)) throw Object.assign(new Error("Restricted evidence requires restrictionReason and publicRedaction."), { code: "REDACTION_REQUIRED" });
  if (classification === "public" && restrictionReason) throw Object.assign(new Error("Public evidence cannot carry a restrictionReason."), { code: "INVALID_CLASSIFICATION" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    bytes,
    inputDigest: createHash("sha256").update(bytes).digest("hex"),
    mimeType,
    skillVersionId: textField(form, "skillVersionId")!,
    criterionId: textField(form, "criterionId", false),
    evaluationId: textField(form, "evaluationId", false),
    classification,
    restrictionReason,
    publicRedaction,
    proofManifest: textField(form, "proofManifest")!,
    proofSignature: textField(form, "proofSignature")!,
    signingKeyId: textField(form, "signingKeyId")!,
  };
};

export const uploadEvidence = (rfsId: string) => v2ParsedCommand({
  action: `upload_evidence:${rfsId}`,
  parse: parseUpload,
  digestInput: (input) => ({
    inputDigest: input.inputDigest,
    mimeType: input.mimeType,
    skillVersionId: input.skillVersionId,
    criterionId: input.criterionId,
    evaluationId: input.evaluationId,
    classification: input.classification,
    restrictionReason: input.restrictionReason,
    publicRedaction: input.publicRedaction,
    proofManifest: input.proofManifest,
    proofSignature: input.proofSignature,
    signingKeyId: input.signingKeyId,
  }),
  handler: async ({ requestId, authentication, input }) => {
    const principalId = await fetchPrincipalQuery(anyApi.principals.getMyPrincipalId, {}, authentication) as string;
    const expiresAt = Date.now() + 9 * 60 * 1_000;
    const authorizationSignature = signServerEnvelope(envelopeSecret(), evidenceUploadAuthorizationPayload({
      principalId,
      rfsId,
      skillVersionId: input.skillVersionId,
      criterionId: input.criterionId,
      evaluationId: input.evaluationId,
      mimeType: input.mimeType,
      expiresAt,
    }));
    const uploadIntent = await fetchPrincipalMutation(anyApi.evidence.createUploadIntent, {
      rfsId,
      skillVersionId: input.skillVersionId,
      criterionId: input.criterionId,
      evaluationId: input.evaluationId,
      mimeType: input.mimeType,
      expiresAt,
      authorizationSignature,
    }, authentication) as { uploadIntentId: string; uploadUrl: string; maximumBytes: number };
    if (input.bytes.byteLength > uploadIntent.maximumBytes) throw Object.assign(new Error("Evidence exceeds the server upload limit."), { code: "PAYLOAD_TOO_LARGE" });
    const encrypted = await encryptEvidence(input.bytes, createRemoteKmsProvider());
    const storageResponse = await fetch(uploadIntent.uploadUrl, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from(encrypted.ciphertext),
      cache: "no-store",
    });
    if (!storageResponse.ok) throw new Error(`Encrypted evidence storage failed with ${storageResponse.status}.`);
    const { storageId } = z.object({ storageId: z.string().min(1) }).parse(await storageResponse.json());
    const finalize = {
      uploadIntentId: uploadIntent.uploadIntentId,
      principalId,
      storageId,
      classification: input.classification,
      restrictionReason: input.restrictionReason,
      plaintextSha256: encrypted.plaintextSha256,
      ciphertextSha256: encrypted.ciphertextSha256,
      wrappedDataKey: encrypted.wrappedDataKey,
      nonce: encrypted.nonce,
      authenticationTag: encrypted.authenticationTag,
      kmsKeyVersion: encrypted.kmsKeyVersion,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
      publicRedaction: input.publicRedaction,
      proofManifest: input.proofManifest,
      proofSignature: input.proofSignature,
      signingKeyId: input.signingKeyId,
    };
    const envelopeSignature = signServerEnvelope(envelopeSecret(), evidenceFinalizePayload(finalize));
    const artifactId = await fetchPrincipalMutation(anyApi.evidence.finalizeUpload, { ...finalize, envelopeSignature }, authentication);
    const result = { data: { artifactId }, capabilities: [], links: { evidence: `/api/v2/rfs/${rfsId}/evidence`, download: `/api/v2/evidence/${String(artifactId)}/download` } };
    return {
      response: v2Success({ requestId, data: result.data, status: 201, links: result.links }),
      result,
      resourceType: "evidenceArtifact",
      resourceId: String(artifactId),
    };
  },
});

export const downloadEvidence = (artifactId: string) => v2Authenticated(async ({ request, requestId, authentication }) => {
  const reason = new URL(request.url).searchParams.get("reason")?.trim() || "controlled_download";
  const authorization = await fetchPrincipalMutation(anyApi.evidence.authorizeDownload, { artifactId, reason }, authentication) as null | {
    storageUrl: string;
    wrappedDataKey: string;
    nonce: string;
    authenticationTag: string;
    kmsKeyVersion: string;
    mimeType: string;
    plaintextSha256: string;
  };
  if (!authorization) return v2Error({ requestId, code: "evidence_access_denied", message: "Evidence is unavailable or access was denied.", status: 403 });
  const ciphertextResponse = await fetch(authorization.storageUrl, { cache: "no-store" });
  if (!ciphertextResponse.ok) throw new Error(`Encrypted evidence storage returned ${ciphertextResponse.status}.`);
  const plaintext = await decryptEvidence({
    ciphertext: new Uint8Array(await ciphertextResponse.arrayBuffer()),
    wrappedDataKey: authorization.wrappedDataKey,
    nonce: authorization.nonce,
    authenticationTag: authorization.authenticationTag,
    kmsKeyVersion: authorization.kmsKeyVersion,
    plaintextSha256: authorization.plaintextSha256,
  }, createRemoteKmsProvider());
  return new Response(Buffer.from(plaintext), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="evidence-${artifactId.replace(/[^a-zA-Z0-9_-]/g, "")}"`,
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": authorization.mimeType,
      "x-content-type-options": "nosniff",
      "x-request-id": requestId,
    },
  });
});
