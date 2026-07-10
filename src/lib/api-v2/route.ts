import { createHash, randomUUID } from "node:crypto";

import { anyApi } from "convex/server";
import { z } from "zod";

import { ApiAuthenticationError, fetchPrincipalMutation, resolveApiAuthentication, type ApiAuthentication } from "@/lib/api-auth";
import { toJsonValue } from "@/lib/json";
import { v2Error, statusForCode } from "./responses";

export type V2Context<T> = {
  request: Request;
  requestId: string;
  authentication: ApiAuthentication;
  input: T;
  idempotencyKey?: string;
};

const errorDetails = (error: unknown) => {
  if (error instanceof ApiAuthenticationError) return { code: error.code, message: error.message, status: error.status };
  if (error instanceof z.ZodError) return { code: "invalid_request", message: "Request payload failed validation.", status: 400, fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[]> };
  if (error && typeof error === "object") {
    const data = "data" in error && error.data && typeof error.data === "object" ? error.data as Record<string, unknown> : error as Record<string, unknown>;
    const code = typeof data.code === "string" ? data.code.toLowerCase() : "request_failed";
    const message = typeof data.message === "string" ? data.message : error instanceof Error ? error.message : "Request failed.";
    return { code, message, status: statusForCode(code) };
  }
  return { code: "request_failed", message: "Request failed.", status: 500 };
};

export const requireSameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  if (!origin || origin.replace(/\/$/, "") !== expected) throw Object.assign(new Error("Cookie-authenticated commands require a matching Origin header."), { code: "CSRF_ORIGIN_MISMATCH" });
};

export const requireCommandOrigin = (request: Request, authentication: Pick<ApiAuthentication, "method">) => {
  if (authentication.method === "cookie") requireSameOrigin(request);
};

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(toJsonValue(value))).digest("hex");

export const v2Public = (handler: (context: { request: Request; requestId: string }) => Promise<Response>) => async (request: Request) => {
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  try { return await handler({ request, requestId }); }
  catch (error) { const details = errorDetails(error); return v2Error({ requestId, ...details, retryable: details.status >= 500, fieldErrors: "fieldErrors" in details ? details.fieldErrors : undefined }); }
};

export const v2Authenticated = (handler: (context: { request: Request; requestId: string; authentication: ApiAuthentication }) => Promise<Response>) => v2Public(async ({ request, requestId }) => {
  const authentication = await resolveApiAuthentication(request);
  const path = new URL(request.url).pathname;
  const rate = await fetchPrincipalMutation(anyApi.apiProtocol.consumeRateLimit, { action: `read:${path}`, limit: 120 }, authentication) as { limit: number; remaining: number; resetAt: number };
  const response = await handler({ request, requestId, authentication });
  response.headers.set("x-ratelimit-limit", String(rate.limit));
  response.headers.set("x-ratelimit-remaining", String(rate.remaining));
  response.headers.set("x-ratelimit-reset", String(Math.ceil(rate.resetAt / 1_000)));
  return response;
});

export const v2ParsedCommand = <T>(args: {
  action: string;
  parse: (request: Request) => Promise<T>;
  digestInput?: (input: T) => unknown;
  handler: (context: V2Context<T>) => Promise<{ response: Response; result?: unknown; resourceType?: string; resourceId?: string }>;
}) => v2Public(async ({ request, requestId }) => {
  const authentication = await resolveApiAuthentication(request);
  requireCommandOrigin(request, authentication);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) return v2Error({ requestId, code: "idempotency_key_required", message: "Every v2 command requires a valid Idempotency-Key header.", status: 400 });
  const input = await args.parse(request);
  const requestDigest = digest(args.digestInput ? args.digestInput(input) : input);
  const reservation = await fetchPrincipalMutation(anyApi.apiProtocol.beginCommand, { action: args.action, idempotencyKey, requestDigest }, authentication) as { recordId: string; replay: boolean; resultJson?: string };
  if (reservation.replay && reservation.resultJson) {
    const replay = JSON.parse(reservation.resultJson) as { data: unknown; resourceVersion?: number; capabilities?: unknown[]; links?: Record<string, string> };
    return Response.json({ apiVersion: "v2", requestId, ...replay }, { headers: { "x-request-id": requestId, "idempotent-replay": "true", "cache-control": "no-store" } });
  }
  try {
    const outcome = await args.handler({ request, requestId, authentication, input, idempotencyKey });
    if (outcome.result !== undefined) {
      await fetchPrincipalMutation(anyApi.apiProtocol.completeCommand, { recordId: reservation.recordId, requestDigest, resultJson: JSON.stringify(toJsonValue(outcome.result)), resultResourceType: outcome.resourceType, resultResourceId: outcome.resourceId }, authentication);
    }
    return outcome.response;
  } catch (error) {
    const details = errorDetails(error);
    await fetchPrincipalMutation(anyApi.apiProtocol.failCommand, { recordId: reservation.recordId, requestDigest, errorCode: details.code }, authentication).catch(() => undefined);
    return v2Error({ requestId, ...details, retryable: details.status >= 500, fieldErrors: "fieldErrors" in details ? details.fieldErrors : undefined });
  }
});

export const v2Command = <T>(args: {
  action: string;
  schema: z.ZodType<T>;
  handler: (context: V2Context<T>) => Promise<{ response: Response; result?: unknown; resourceType?: string; resourceId?: string }>;
}) => v2ParsedCommand({
  action: args.action,
  parse: async (request) => args.schema.parse(await request.json().catch(() => ({}))),
  handler: args.handler,
});
