import { ConvexError } from "convex/values";

type ResourceType = "user" | "rfs" | "skill" | "contribution" | "purchase" | "payout";

export const okWriteResponse = (
  resourceType: ResourceType,
  resourceId: string,
  nextState: string,
  status = 200,
) =>
  Response.json(
    {
      status: "ok",
      resourceType,
      resourceId,
      nextState,
    },
    { status },
  );

export const errorResponse = (code: string, message: string, status = 400) =>
  Response.json(
    {
      status: "error",
      code,
      message,
    },
    { status },
  );

const toCodeAndMessage = (error: unknown): { code: string; message: string } => {
  if (error instanceof SyntaxError) {
    return { code: "INVALID_JSON", message: "Request body must be valid JSON." };
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
    const candidates = [error.message, ...(error.message.match(/\{[^{}\r\n]*\}/g) ?? [])];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as { code?: unknown; message?: unknown };
        if (typeof parsed.code === "string" && typeof parsed.message === "string") {
          return { code: parsed.code, message: parsed.message };
        }
      } catch {
        // A wrapped Convex message can contain non-JSON text around the payload.
      }
    }
  }

  return { code: "INTERNAL_ERROR", message: "Unexpected server error." };
};

const statusForCode = (code: string) => {
  if (code === "UNAUTHORIZED") {
    return 401;
  }
  if (code === "NOT_FOUND") {
    return 404;
  }
  if (code === "FORBIDDEN") {
    return 403;
  }
  if (code === "PAYMENT_UNAVAILABLE") {
    return 503;
  }
  if (
    code === "ALREADY_CLAIMED" ||
    code === "IDEMPOTENCY_CONFLICT" ||
    code === "INVALID_STATE"
  ) {
    return 409;
  }
  if (code.startsWith("INVALID_")) {
    return 400;
  }
  return 500;
};

export const errorResponseFrom = (error: unknown) => {
  const { code, message } = toCodeAndMessage(error);
  return errorResponse(code, message, statusForCode(code));
};
