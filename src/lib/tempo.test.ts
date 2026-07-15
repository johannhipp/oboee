import { describe, expect, it } from "vitest";

import { isMvpPaymentBaseUnits } from "./tempo";

describe("Tempo MVP amount boundary", () => {
  it("accepts only positive payments below one cent", () => {
    expect(isMvpPaymentBaseUnits(BigInt(0))).toBe(false);
    expect(isMvpPaymentBaseUnits(BigInt(1))).toBe(true);
    expect(isMvpPaymentBaseUnits(BigInt(9_000))).toBe(true);
    expect(isMvpPaymentBaseUnits(BigInt(9_001))).toBe(false);
  });
});
