import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpProblem, okWrite, problem, responseFromError } from "./http";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HTTP envelopes", () => {
  it("emits typed write extras without response round-tripping", async () => {
    const response = okWrite(
      "purchase",
      "purchase-1",
      "published",
      {
        accessGranted: true,
        receiptReference: "0xreceipt",
      },
      201,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      resourceType: "purchase",
      resourceId: "purchase-1",
      nextState: "published",
      accessGranted: true,
      receiptReference: "0xreceipt",
    });
  });

  it("emits explicit problem envelopes", async () => {
    const response = problem("INVALID_ARGUMENT", "Bad input.", 422);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      code: "INVALID_ARGUMENT",
      message: "Bad input.",
    });
  });

  it.each([
    ["UNAUTHORIZED", 401],
    ["NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["INVALID_STATE", 409],
    ["INVALID_AMOUNT", 400],
  ])("maps %s to HTTP %i", async (code, status) => {
    const response = responseFromError(
      new Error(JSON.stringify({ code, message: "Mapped problem." })),
    );
    expect(response.status).toBe(status);
  });

  it("preserves an explicit boundary problem", async () => {
    const response = responseFromError(
      new HttpProblem("INVALID_CURSOR", "Bad cursor.", 400),
    );
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CURSOR",
      message: "Bad cursor.",
    });
  });

  it("redacts unknown errors and returns a traceable correlation ID", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = responseFromError(new Error("database password leaked"));

    expect(response.status).toBe(500);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toMatchObject({
      status: "error",
      code: "INTERNAL_ERROR",
      message: "Unexpected server error.",
    });
    expect(payload.correlationId).toEqual(expect.any(String));
    expect(JSON.stringify(payload)).not.toContain("password");
  });
});
