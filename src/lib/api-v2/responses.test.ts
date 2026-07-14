import { describe, expect, it } from "vitest";

import { statusForCode } from "./responses";

describe("v2 error status mapping", () => {
  it.each([
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["PASSKEY_REAUTH_REQUIRED", 403],
    ["IDEMPOTENCY_CONFLICT", 409],
    ["STALE_RESOURCE", 409],
    ["RATE_LIMITED", 429],
  ])("maps %s to HTTP %s", (code, status) => {
    expect(statusForCode(code)).toBe(status);
  });

  it("keeps the existing fallback for unknown codes", () => {
    expect(statusForCode("unexpected_failure")).toBe(400);
  });
});
