import { describe, expect, it } from "vitest";

import { paymentInstructionFromResponse } from "./payment";

describe("instruction payment client", () => {
  it("treats a 402 as a payment instruction, never as success", () => {
    const response = new Response(null, {
      status: 402,
      headers: { "WWW-Authenticate": "Payment challenge" },
    });
    const instruction = paymentInstructionFromResponse(response, {
      intent: "fund",
      method: "POST",
      url: "https://oboe.test/api/rfs/id/fund",
      jsonBody: { amount: "0.003" },
    });

    expect(instruction).toMatchObject({ intent: "fund" });
    expect(instruction?.command).toContain("Payment challenge");
  });

  it("returns no instruction for a paid response", () => {
    expect(
      paymentInstructionFromResponse(new Response(null, { status: 200 }), {
        intent: "purchase",
        method: "GET",
        url: "https://oboe.test/api/skills/id/content",
      }),
    ).toBeNull();
  });
});
