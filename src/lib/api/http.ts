import { ConvexError } from "convex/values";

import { isAuthenticated } from "../auth-server";

export type ResourceType =
  | "user"
  | "rfs"
  | "skill"
  | "contribution"
  | "purchase";

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const STATUS_BY_CODE = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_CLAIMED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  PAYMENT_UNAVAILABLE: 503,
  CONFIGURATION_ERROR: 503,
} as const;

export class HttpProblem extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpProblem";
  }
}

export const ok = <TPayload extends JsonObject>(
  payload: TPayload,
  status = 200,
) => Response.json({ status: "ok", ...payload }, { status });

export const okWrite = <TExtras extends JsonObject = Record<string, never>>(
  resourceType: ResourceType,
  resourceId: string,
  nextState: string,
  extras?: TExtras,
  status = 200,
) =>
  ok(
    {
      resourceType,
      resourceId,
      nextState,
      ...(extras ?? {}),
    } as {
      resourceType: ResourceType;
      resourceId: string;
      nextState: string;
    } & TExtras,
    status,
  );

export const problem = (
  code: string,
  message: string,
  status = 400,
  correlationId?: string,
) =>
  Response.json(
    {
      status: "error",
      code,
      message,
      ...(correlationId ? { correlationId } : {}),
    },
    { status },
  );

const readStructuredError = (error: unknown) => {
  if (error instanceof HttpProblem) {
    return { code: error.code, message: error.message, status: error.status };
  }
  if (error instanceof SyntaxError) {
    return {
      code: "INVALID_JSON",
      message: "Request body must be valid JSON.",
      status: 400,
    };
  }
  if (error instanceof ConvexError) {
    const data = error.data;
    if (
      data &&
      typeof data === "object" &&
      "code" in data &&
      typeof data.code === "string" &&
      "message" in data &&
      typeof data.message === "string"
    ) {
      return { code: data.code, message: data.message };
    }
  }
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.message
  ) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error && error.message) {
    // Convex's Next adapter can wrap structured errors in diagnostic text.
    const candidates = [
      error.message,
      ...(error.message.match(/\{[^{}\r\n]*\}/g) ?? []),
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as {
          code?: unknown;
          message?: unknown;
        };
        if (
          typeof parsed.code === "string" &&
          typeof parsed.message === "string"
        ) {
          return { code: parsed.code, message: parsed.message };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
};

const statusForCode = (code: string) => {
  if (code in STATUS_BY_CODE) {
    return STATUS_BY_CODE[code as keyof typeof STATUS_BY_CODE];
  }
  return code.startsWith("INVALID_") ? 400 : 500;
};

export const responseFromError = (error: unknown) => {
  const structured = readStructuredError(error);
  if (structured) {
    const status = structured.status ?? statusForCode(structured.code);
    if (status < 500 || structured.code in STATUS_BY_CODE) {
      return problem(structured.code, structured.message, status);
    }
  }

  const correlationId = crypto.randomUUID();
  console.error(`[${correlationId}] Unhandled API error`, error);
  return problem(
    "INTERNAL_ERROR",
    "Unexpected server error.",
    500,
    correlationId,
  );
};

export const requireAuthenticatedRoute = async () => {
  if (!(await isAuthenticated())) {
    throw new HttpProblem("UNAUTHORIZED", "Authentication required.", 401);
  }
};
