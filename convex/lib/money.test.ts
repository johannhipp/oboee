import { describe, expect, it } from "vitest";

import { allocateLargestRemainder, calculateSettlementPools } from "./money";
import { baseUnits, basisPoints } from "./policy";

describe("largest remainder allocation", () => {
  it("conserves tiny pools and breaks equal remainders by stable ID", () => {
    const allocations = allocateLargestRemainder(baseUnits(BigInt(2)), [
      { contributionId: "c", amountBaseUnits: baseUnits(BigInt(1)) },
      { contributionId: "a", amountBaseUnits: baseUnits(BigInt(1)) },
      { contributionId: "b", amountBaseUnits: baseUnits(BigInt(1)) },
    ]);
    expect(allocations).toEqual([
      { contributionId: "a", amountBaseUnits: BigInt(1) },
      { contributionId: "b", amountBaseUnits: BigInt(1) },
      { contributionId: "c", amountBaseUnits: BigInt(0) },
    ]);
    expect(allocations.reduce((sum, row) => sum + row.amountBaseUnits, BigInt(0))).toBe(BigInt(2));
  });

  it("allocates proportionally and conserves a large integer", () => {
    const pool = BigInt("9007199254740993000");
    const allocations = allocateLargestRemainder(baseUnits(pool), [
      { contributionId: "a", amountBaseUnits: baseUnits(BigInt(1)) },
      { contributionId: "b", amountBaseUnits: baseUnits(BigInt(2)) },
    ]);
    expect(allocations.reduce((sum, row) => sum + row.amountBaseUnits, BigInt(0))).toBe(pool);
  });

  it("rejects duplicate IDs and positive pools without contributions", () => {
    expect(() =>
      allocateLargestRemainder(baseUnits(BigInt(1)), [
        { contributionId: "a", amountBaseUnits: baseUnits(BigInt(1)) },
        { contributionId: "a", amountBaseUnits: baseUnits(BigInt(1)) },
      ]),
    ).toThrow("unique");
    expect(() => allocateLargestRemainder(baseUnits(BigInt(1)), [])).toThrow("positive contributions");
  });
});

describe("settlement pools", () => {
  it("deducts the platform fee after quality and conserves source pools", () => {
    const result = calculateSettlementPools({
      workEscrow: baseUnits(BigInt(1_000_000)),
      reviewReserve: baseUnits(BigInt(100_000)),
      finalMultiplierBps: basisPoints(6_000),
      committedReviewerFees: baseUnits(BigInt(25_000)),
      slashedBond: baseUnits(BigInt(10_000)),
    });
    expect(result).toEqual({
      grossAuthorBaseUnits: BigInt(600_000),
      platformFeeBaseUnits: BigInt(6_000),
      netAuthorBaseUnits: BigInt(594_000),
      unusedReviewReserveBaseUnits: BigInt(75_000),
      refundPoolBaseUnits: BigInt(485_000),
    });
    expect(
      result.netAuthorBaseUnits +
        result.platformFeeBaseUnits +
        result.refundPoolBaseUnits +
        BigInt(25_000),
    ).toBe(BigInt(1_110_000));
  });
});
