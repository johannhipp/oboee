import { describe, expect, it } from "vitest";

import { buildTempoPaymentCommand } from "./payment-command";

describe("Tempo CLI payment handoff", () => {
  it("builds a Moderato command that signs the exact browser challenge", () => {
    const command = buildTempoPaymentCommand({
      challenge: "Payment abc'def",
      method: "POST",
      url: "http://localhost:3000/api/rfs/rfs-id/fund",
      jsonBody: { amount: "0.001" },
    });

    expect(command).toContain("Set MPPX_ACCOUNT to an explicitly selected Tempo Moderato account");
    expect(command).not.toContain("MPPX_ACCOUNT=main");
    expect(command).toContain("https://rpc.moderato.tempo.xyz");
    expect(command).toContain("mppx sign");
    expect(command).toContain("Payment abc'\"'\"'def");
    expect(command).toContain("curl --fail-with-body");
    expect(command).toContain("-X POST");
    expect(command).toContain("Authorization: $AUTHORIZATION");
    expect(command).toContain("{\"amount\":\"0.001\"}");
  });
});
