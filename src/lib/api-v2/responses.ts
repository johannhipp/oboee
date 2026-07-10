import { toJsonValue } from "@/lib/json";
import { z } from "zod";
import type { Capability } from "./schemas/common";
import { errorEnvelopeSchema, successEnvelopeSchema } from "./schemas/common";

const baseHeaders = (requestId: string, extra?: HeadersInit) => {
  const headers = new Headers(extra);
  headers.set("x-request-id", requestId);
  headers.set("x-ratelimit-limit", "120");
  headers.set("x-ratelimit-remaining", "119");
  headers.set("cache-control", "no-store");
  return headers;
};

export const v2Success = (args: {
  requestId: string;
  data: unknown;
  status?: number;
  resourceVersion?: number;
  capabilities?: Capability[];
  links?: Record<string, string>;
  page?: unknown;
  headers?: HeadersInit;
}) => { const payload = successEnvelopeSchema(z.unknown()).parse(toJsonValue({
  apiVersion: "v2",
  requestId: args.requestId,
  data: args.data,
  resourceVersion: args.resourceVersion,
  capabilities: args.capabilities ?? [],
  links: { self: "", openapi: "/api/v2/openapi.json", ...(args.links ?? {}) },
  page: args.page,
})); return Response.json(payload, { status: args.status ?? 200, headers: baseHeaders(args.requestId, args.headers) }); };

export const v2Error = (args: {
  requestId: string;
  code: string;
  message: string;
  status: number;
  retryable?: boolean;
  fieldErrors?: Record<string, string[]>;
  requiredPermission?: string;
  retryAfterSeconds?: number;
  links?: Record<string, string>;
}) => {
  const headers = baseHeaders(args.requestId);
  if (args.retryAfterSeconds) headers.set("retry-after", String(args.retryAfterSeconds));
  const payload = errorEnvelopeSchema.parse({ apiVersion: "v2", requestId: args.requestId, code: args.code, message: args.message, fieldErrors: args.fieldErrors, requiredPermission: args.requiredPermission, retryable: args.retryable ?? false, retryAfterSeconds: args.retryAfterSeconds, links: { openapi: "/api/v2/openapi.json", ...(args.links ?? {}) } });
  return Response.json(payload, { status: args.status, headers });
};

export const statusForCode = (code: string) => {
  const normalized = code.toLowerCase();
  if (normalized.includes("unauthorized") || normalized === "authentication_required") return 401;
  if (normalized.includes("forbidden") || normalized.includes("ineligible") || normalized.includes("required")) return 403;
  if (normalized.includes("not_found")) return 404;
  if (normalized.includes("stale") || normalized.includes("conflict") || normalized.includes("duplicate") || normalized.includes("in_progress")) return 409;
  if (normalized.includes("disabled") || normalized.includes("configuration")) return 503;
  if (normalized.includes("rate")) return 429;
  return 400;
};
