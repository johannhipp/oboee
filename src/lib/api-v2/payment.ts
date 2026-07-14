import { Challenge, Credential } from "mppx";
import { anyApi } from "convex/server";

import { paymentReceiptPayload } from "../../../shared/authorization-envelope";
import { signServerEnvelope } from "../../../shared/server-envelope";
import { ApiAuthenticationError, fetchPrincipalMutation, fetchPrincipalQuery, resolveApiAuthentication } from "@/lib/api-auth";
import { getMppx } from "@/lib/mpp";
import { v2Error, v2Success } from "./responses";
import { requireCommandOrigin } from "./route";
import { bondIntentSchema, fundingIntentSchema, purchaseIntentSchema } from "./schemas/common";

const formatBaseUnits = (value: bigint) => {
  const whole = value / BigInt(1_000_000);
  const fraction = (value % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const receiptReference = (credential: ReturnType<typeof Credential.fromRequest>) => {
  const payload = credential.payload as { type?: unknown; hash?: unknown; signature?: unknown };
  if (payload.type === "hash" && typeof payload.hash === "string") return payload.hash;
  if (payload.type === "transaction" && typeof payload.signature === "string") return payload.signature;
  throw new Error("Verified payment credential has no receipt reference.");
};

const envelopeSecret = () => {
  const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("OBOE_SERVER_ENVELOPE_SECRET is not configured.");
  return secret;
};

type Intent = {
  intentId: string;
  resourceType: string;
  resourceId: string;
  skillVersionId?: string;
  amountBaseUnits: bigint;
  tokenAddress: string;
  network: string;
  contractDigest: string;
  challengeEnvelope: string;
  challengeSignature: string;
  expiresAt: number;
};

const paidIntentResponse = async (
  request: Request,
  requestId: string,
  intent: Intent,
  authentication: Awaited<ReturnType<typeof resolveApiAuthentication>>,
) => {
  const handler = getMppx().charge({
    amount: formatBaseUnits(intent.amountBaseUnits),
    expires: new Date(intent.expiresAt).toISOString(),
    externalId: intent.intentId,
    description: `${intent.resourceType}:${intent.resourceId}`,
    meta: { intentId: intent.intentId, contractDigest: intent.contractDigest, envelope: intent.challengeEnvelope, signature: intent.challengeSignature },
  })(async (paidRequest: Request) => {
    const credential = Credential.fromRequest(paidRequest);
    const challenge = credential.challenge;
    const challengeMeta = Challenge.meta(challenge);
    const challengeRequest = challenge.request as { amount?: unknown; currency?: unknown; externalId?: unknown };
    if (challengeRequest.amount !== intent.amountBaseUnits.toString() || typeof challengeRequest.currency !== "string" || challengeRequest.currency.toLowerCase() !== intent.tokenAddress.toLowerCase() || challengeRequest.externalId !== intent.intentId || challengeMeta?.intentId !== intent.intentId || challengeMeta?.contractDigest !== intent.contractDigest || challengeMeta?.envelope !== intent.challengeEnvelope || challengeMeta?.signature !== intent.challengeSignature) {
      return v2Error({ requestId, code: "payment_challenge_mismatch", message: "Verified payment credential does not match the reserved intent.", status: 400 });
    }
    const reference = receiptReference(credential);
    const verifiedAt = Date.now();
    const principalId = await fetchPrincipalQuery(anyApi.principals.getMyPrincipalId, {}, authentication) as string;
    const signature = signServerEnvelope(envelopeSecret(), paymentReceiptPayload({
      intentId: intent.intentId, principalId, resourceType: intent.resourceType,
      resourceId: intent.resourceId, skillVersionId: intent.skillVersionId,
      amountBaseUnits: intent.amountBaseUnits, tokenAddress: intent.tokenAddress, network: intent.network,
      contractDigest: intent.contractDigest, challengeId: challenge.id, receiptReference: reference, verifiedAt,
    }));
    const confirmed = await fetchPrincipalMutation(anyApi.paymentIntents.confirmVerifiedReceipt, {
      intentId: intent.intentId,
      challengeId: challenge.id,
      receiptReference: reference,
      verifiedAt,
      receiptEnvelopeSignature: signature,
    }, authentication);
    return v2Success({ requestId, data: confirmed, capabilities: [], links: { intent: `/api/v2/me/work`, resource: intent.resourceType === "rfs_funding" ? `/api/v2/rfs/${intent.resourceId}` : `/api/v2/skills/${intent.resourceId}` } });
  });
  return await handler(request);
};

export const fundingIntentRoute = async (request: Request, rfsId: string) => {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  try {
    const authentication = await resolveApiAuthentication(request);
    requireCommandOrigin(request, authentication);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return v2Error({ requestId, code: "idempotency_key_required", message: "Idempotency-Key is required.", status: 400 });
    const body = fundingIntentSchema.parse(await request.clone().json());
    const intent = await fetchPrincipalMutation(anyApi.paymentIntents.createFundingIntent, { rfsId, amountBaseUnits: BigInt(body.amountBaseUnits), idempotencyKey }, authentication) as Intent;
    return await paidIntentResponse(request, requestId, intent, authentication);
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return v2Error({ requestId, code: error.code, message: error.message, status: error.status });
    }
    return v2Error({ requestId, code: "payment_intent_failed", message: error instanceof Error ? error.message : "Payment intent failed.", status: 400 });
  }
};

export const purchaseIntentRoute = async (request: Request, skillId: string) => {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  try {
    const authentication = await resolveApiAuthentication(request);
    requireCommandOrigin(request, authentication);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return v2Error({ requestId, code: "idempotency_key_required", message: "Idempotency-Key is required.", status: 400 });
    const body = purchaseIntentSchema.parse(await request.clone().json());
    const intent = await fetchPrincipalMutation(anyApi.paymentIntents.createPurchaseIntent, { skillId, skillVersionId: body.skillVersionId, idempotencyKey }, authentication) as Intent;
    return await paidIntentResponse(request, requestId, intent, authentication);
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return v2Error({ requestId, code: error.code, message: error.message, status: error.status });
    }
    return v2Error({ requestId, code: "payment_intent_failed", message: error instanceof Error ? error.message : "Payment intent failed.", status: 400 });
  }
};

export const bondIntentRoute = async (request: Request, rfsId: string) => {
  const requestId = request.headers.get("x-request-id")?.trim() || crypto.randomUUID();
  try {
    const authentication = await resolveApiAuthentication(request);
    requireCommandOrigin(request, authentication);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return v2Error({ requestId, code: "idempotency_key_required", message: "Idempotency-Key is required.", status: 400 });
    const body = bondIntentSchema.parse(await request.clone().json());
    const intent = await fetchPrincipalMutation(anyApi.paymentIntents.createBondIntent, { rfsId, applicationId: body.applicationId, idempotencyKey }, authentication) as Intent;
    return await paidIntentResponse(request, requestId, intent, authentication);
  } catch (error) {
    if (error instanceof ApiAuthenticationError) {
      return v2Error({ requestId, code: error.code, message: error.message, status: error.status });
    }
    return v2Error({ requestId, code: "payment_intent_failed", message: error instanceof Error ? error.message : "Payment intent failed.", status: 400 });
  }
};
