import { describe, expect, it } from "vitest";

import {
  normalizePayoutWalletAddress,
  sumClaimablePayoutBaseUnits,
} from "./users";

describe("payout wallet validation", () => {
  it("normalizes a valid address and rejects invalid or zero addresses", () => {
    expect(
      normalizePayoutWalletAddress(" 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD "),
    ).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(() => normalizePayoutWalletAddress("not-an-address")).toThrow(
      "INVALID_WALLET_ADDRESS",
    );
    expect(() =>
      normalizePayoutWalletAddress("0x0000000000000000000000000000000000000000"),
    ).toThrow("INVALID_WALLET_ADDRESS");
  });

  it("includes both funding and purchase earnings in the claimable balance", () => {
    expect(
      sumClaimablePayoutBaseUnits([
        { netAmountBaseUnits: BigInt(990), status: "claimable" },
        { netAmountBaseUnits: BigInt(495), status: "claimable" },
        { netAmountBaseUnits: BigInt(200), status: "claimed" },
        { netAmountBaseUnits: BigInt(100), status: "locked" },
      ]),
    ).toBe(BigInt(1_485));
  });
});
