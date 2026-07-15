import { describe, expect, it } from "vitest";

import { errorResponseFrom } from "./responses";

describe("API error responses", () => {
  it("extracts a structured Convex error from a wrapped server message", async () => {
    const response = errorResponseFrom(
      new Error(
        '[CONVEX M(rfs:get)] Server Error\nUncaught ConvexError: {"code":"NOT_FOUND","message":"RFS not found."}\n    at handler',
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      code: "NOT_FOUND",
      message: "RFS not found.",
    });
  });

  it("maps payment configuration failures to service unavailable", async () => {
    const response = errorResponseFrom(
      Object.assign(new Error("Payment service is not configured."), {
        code: "PAYMENT_UNAVAILABLE",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "PAYMENT_UNAVAILABLE",
    });
  });

  it("maps idempotency conflicts to conflict", async () => {
    const response = errorResponseFrom(
      new Error('{"code":"IDEMPOTENCY_CONFLICT","message":"Payment facts differ."}'),
    );

    expect(response.status).toBe(409);
  });

  it("maps malformed JSON bodies to a client error", async () => {
    const response = errorResponseFrom(new SyntaxError("Unexpected end of JSON input"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_JSON" });
  });
});
