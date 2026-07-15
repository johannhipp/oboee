import { describe, expect, it } from "vitest";

import {
  canAttemptFundingPayment,
  preventClosedFundingChallenge,
} from "./route";

describe("funding route idempotency boundary", () => {
  it("lets an exact paid retry reach payment recording after the RFS closes", () => {
    expect(canAttemptFundingPayment("open", null)).toBe(true);
    expect(canAttemptFundingPayment("funded", null)).toBe(false);
    expect(canAttemptFundingPayment("funded", "Bearer session-token")).toBe(false);
    expect(canAttemptFundingPayment("funded", "Payment credential-data")).toBe(true);
    expect(canAttemptFundingPayment("published", "payment credential-data")).toBe(true);
  });

  it("never returns a fresh payment challenge after the RFS closes", async () => {
    const challenge = new Response(null, {
      status: 402,
      headers: { "WWW-Authenticate": "Payment challenge-data" },
    });

    expect(preventClosedFundingChallenge("open", challenge)).toBe(challenge);

    const closedResponse = preventClosedFundingChallenge("funded", challenge);
    expect(closedResponse.status).toBe(409);
    expect(closedResponse.headers.has("WWW-Authenticate")).toBe(false);
    await expect(closedResponse.json()).resolves.toMatchObject({
      code: "INVALID_STATE",
    });
  });
});
