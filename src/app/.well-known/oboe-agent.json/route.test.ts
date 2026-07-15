import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const originalFundingTokenAddress = process.env.MPP_FUNDING_TOKEN_ADDRESS;

afterEach(() => {
  if (originalFundingTokenAddress === undefined) {
    delete process.env.MPP_FUNDING_TOKEN_ADDRESS;
  } else {
    process.env.MPP_FUNDING_TOKEN_ADDRESS = originalFundingTokenAddress;
  }
});

describe("Oboe agent manifest", () => {
  it("normalizes whitespace from the advertised funding token address", async () => {
    process.env.MPP_FUNDING_TOKEN_ADDRESS = "  0x2222222222222222222222222222222222222222\n";

    const response = await GET(new Request("https://example.test/.well-known/oboe-agent.json"));
    const manifest = await response.json() as { payments: { token: string } };

    expect(manifest.payments.token).toBe("0x2222222222222222222222222222222222222222");
    expect(manifest.payments.token).not.toMatch(/\s/);
  });

  it("uses the runtime placeholder when the funding token is blank", async () => {
    process.env.MPP_FUNDING_TOKEN_ADDRESS = " \n ";

    const response = await GET(new Request("https://example.test/.well-known/oboe-agent.json"));
    const manifest = await response.json() as { payments: { token: string } };

    expect(manifest.payments.token).toBe("configured-at-runtime");
  });
});
