import { describe, expect, it } from "vitest";

import {
  formatTokenBaseUnits,
  isMvpPaymentBaseUnits,
  parseTokenAmount,
  progressPercent,
  splitPlatformFee,
} from "./money";

describe("token money", () => {
  it.each([
    ["0", BigInt(0)],
    ["0.000001", BigInt(1)],
    ["0.003", BigInt(3_000)],
    ["0.009", BigInt(9_000)],
    ["1.50", BigInt(1_500_000)],
    ["0001", null],
    ["1.0000001", null],
    ["-1", null],
    ["+1", null],
  ])("parses %s without floating point", (input, expected) => {
    expect(parseTokenAmount(input)).toBe(expected);
  });

  it.each([
    [BigInt(0), "0.00"],
    [BigInt(1), "0.000001"],
    [BigInt(3_000), "0.003"],
    [BigInt(9_000), "0.009"],
    [BigInt(1_500_000), "1.50"],
  ])("formats %s base units as %s", (input, expected) => {
    expect(formatTokenBaseUnits(input)).toBe(expected);
  });

  it("rejects invalid base-unit strings instead of displaying zero", () => {
    expect(() => formatTokenBaseUnits("1.5")).toThrow(
      "Token base units must be an integer string.",
    );
  });

  it("uses floor rounding for the one-percent platform fee", () => {
    expect(splitPlatformFee(BigInt(99))).toEqual({
      platformFeeBaseUnits: BigInt(0),
      netAmountBaseUnits: BigInt(99),
    });
    expect(splitPlatformFee(BigInt(101))).toEqual({
      platformFeeBaseUnits: BigInt(1),
      netAmountBaseUnits: BigInt(100),
    });
  });

  it("enforces the MVP payment range and bounds progress", () => {
    expect(isMvpPaymentBaseUnits(BigInt(0))).toBe(false);
    expect(isMvpPaymentBaseUnits(BigInt(1))).toBe(true);
    expect(isMvpPaymentBaseUnits(BigInt(9_000))).toBe(true);
    expect(isMvpPaymentBaseUnits(BigInt(9_001))).toBe(false);
    expect(progressPercent(BigInt(3), BigInt(4))).toBe(75);
    expect(progressPercent(BigInt(5), BigInt(4))).toBe(100);
  });
});
