import { describe, expect, it } from "vitest";

import { signServerEnvelope, verifyServerEnvelope } from "./server-envelope";

const secret = "0123456789abcdef0123456789abcdef";

describe("server envelopes", () => {
  it("authenticates the exact payload", () => {
    const signature = signServerEnvelope(secret, "payload");
    expect(verifyServerEnvelope(secret, "payload", signature)).toBe(true);
    expect(verifyServerEnvelope(secret, "changed", signature)).toBe(false);
  });

  it("rejects weak secrets and malformed signatures", () => {
    expect(() => signServerEnvelope("short", "payload")).toThrow("32");
    expect(verifyServerEnvelope(secret, "payload", "bad")).toBe(false);
  });
});
