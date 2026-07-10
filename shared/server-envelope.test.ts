import { describe, expect, it } from "vitest";

import { signServerEnvelope, verifyServerEnvelope } from "./server-envelope";
import { paymentReceiptPayload } from "./authorization-envelope";

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

  it("binds payment receipts to exact intent facts", () => {
    const payload = paymentReceiptPayload({
      intentId: "intent-1",
      principalId: "principal-1",
      resourceType: "rfs_funding",
      resourceId: "rfs-1",
      amountBaseUnits: BigInt(100),
      tokenAddress: "0xTOKEN",
      network: "TEMPO",
      contractDigest: "sha256:contract",
      challengeId: "challenge-1",
      receiptReference: "tx-1",
      verifiedAt: 1_000,
    });
    const signature = signServerEnvelope(secret, payload);
    expect(verifyServerEnvelope(secret, payload, signature)).toBe(true);
    expect(
      verifyServerEnvelope(secret, payload.replace('"100"', '"101"'), signature),
    ).toBe(false);
  });
});
