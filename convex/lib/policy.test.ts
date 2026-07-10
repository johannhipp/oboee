import { describe, expect, it } from "vitest";

import {
  baseUnits,
  calculateCriterionDecision,
  getPolicy,
  reviewReserveFor,
  riskTierForWorkEscrow,
  validateCriteria,
  type ContractCriterion,
} from "./policy";

const unit = BigInt(1_000_000);
const criterion = (
  id: string,
  weightBps: number,
  requiredForPublication: boolean,
): ContractCriterion => ({
  id,
  title: `Criterion ${id}`,
  passCondition: { kind: "boolean_assertion", assertion: `${id} is true` },
  verificationMethod: "Run the deterministic fixture.",
  weightBps,
  tags: ["security"],
  requiredForPublication,
});

const validCriteria = [criterion("required", 6_000, true), criterion("optional", 4_000, false)];

describe("policy v2", () => {
  it("is immutable and rejects unknown versions", () => {
    expect(getPolicy(2).version).toBe(2);
    expect(() => getPolicy(1)).toThrow("Unsupported policy version");
  });

  it.each([
    [BigInt(99) * unit, "low"],
    [BigInt(100) * unit, "medium"],
    [BigInt(499) * unit, "medium"],
    [BigInt(500) * unit, "high"],
  ] as const)("maps %s base units to %s risk", (amount, expected) => {
    expect(riskTierForWorkEscrow(baseUnits(amount))).toBe(expected);
  });

  it.each([
    [BigInt(50) * unit, BigInt(5) * unit],
    [BigInt(500) * unit, BigInt(25) * unit],
    [BigInt(3_000) * unit, BigInt(100) * unit],
  ] as const)("clamps the review reserve for %s", (amount, expected) => {
    expect(reviewReserveFor(baseUnits(amount))).toBe(expected);
  });
});

describe("criteria contract", () => {
  it("accepts exact total and required thresholds", () => {
    expect(validateCriteria(validCriteria)).toEqual({
      valid: true,
      totalWeightBps: 10_000,
      requiredWeightBps: 6_000,
    });
  });

  it.each([
    [[criterion("a", 5_999, true), criterion("b", 4_000, false)], "exactly 10,000"],
    [[criterion("a", 6_001, true), criterion("b", 4_000, false)], "exactly 10,000"],
    [[criterion("a", 5_999, true), criterion("b", 4_001, false)], "at least 6,000"],
    [[criterion("a", 6_000, true), criterion("a", 4_000, false)], "duplicated"],
  ] as const)("rejects invalid criterion set %#", (criteria, expectedError) => {
    const result = validateCriteria(criteria);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.join(" ")).toContain(expectedError);
    }
  });
});

describe("criterion decisions", () => {
  it.each([
    ["first_version", { required: "passed", optional: "passed" }, 10_000, "accept", true],
    ["first_version", { required: "failed", optional: "passed" }, 4_000, "request_revision", false],
    ["revised", { required: "passed", optional: "passed" }, 9_000, "accept", true],
    ["declined", { required: "passed", optional: "passed" }, 9_000, "reject", false],
    ["missed", { required: "failed", optional: "passed" }, 4_000, "reject", false],
  ] as const)("handles %s result %#", (revisionStage, results, multiplier, decision, publish) => {
    const result = calculateCriterionDecision({
      workEscrow: baseUnits(BigInt(101)),
      criteria: validCriteria,
      results,
      revisionStage,
      harmful: false,
    });

    expect(result.multiplierBps).toBe(multiplier);
    expect(result.decision).toBe(decision);
    expect(result.publicationAllowed).toBe(publish);
    expect(result.grossAuthorBaseUnits).toBe(
      (BigInt(101) * BigInt(multiplier)) / BigInt(10_000),
    );
  });

  it("forces verified harm to zero regardless of passed criteria", () => {
    expect(
      calculateCriterionDecision({
        workEscrow: baseUnits(BigInt(1_000_000)),
        criteria: validCriteria,
        results: { required: "passed", optional: "passed" },
        revisionStage: "first_version",
        harmful: true,
      }),
    ).toMatchObject({
      multiplierBps: 0,
      grossAuthorBaseUnits: BigInt(0),
      publicationAllowed: false,
      decision: "block_harmful",
    });
  });
});
