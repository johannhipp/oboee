import { describe, expect, it } from "vitest";

import { allocateFundingReceipt } from "./paymentPolicy";
import { baseUnits } from "./policy";

describe("funding receipt allocation", () => {
  it.each([
    { target: BigInt(100), current: BigInt(20), receipt: BigInt(30), applied: BigInt(30), refund: BigInt(0) },
    { target: BigInt(100), current: BigInt(90), receipt: BigInt(30), applied: BigInt(10), refund: BigInt(20) },
    { target: BigInt(100), current: BigInt(100), receipt: BigInt(30), applied: BigInt(0), refund: BigInt(30) },
  ])("preserves every externally paid unit %#", ({ target, current, receipt, applied, refund }) => {
    const result = allocateFundingReceipt({
      fundingTargetBaseUnits: baseUnits(target),
      currentAmountBaseUnits: baseUnits(current),
      receiptAmountBaseUnits: baseUnits(receipt),
    });
    expect(result).toEqual({
      appliedAmountBaseUnits: applied,
      refundAmountBaseUnits: refund,
    });
    expect(result.appliedAmountBaseUnits + result.refundAmountBaseUnits).toBe(receipt);
  });
});
