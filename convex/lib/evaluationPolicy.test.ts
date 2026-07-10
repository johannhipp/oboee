import { describe, expect, it } from "vitest";

import { acceptanceQuorum, harmfulHold, nextReviewAssignmentFee, reductionQuorum, type EvaluationSignal } from "./evaluationPolicy";

const signal = (overrides: Partial<EvaluationSignal> = {}): EvaluationSignal => ({
  clusterId: "cluster-a",
  relevantTagTrustBps: 6_000,
  eligible: true,
  freeform: false,
  machineVerifiedProof: true,
  harmful: false,
  criterionResults: { required: "failed" },
  ...overrides,
});

describe("evaluation quorum", () => {
  it("caps multiple reviewers in one cluster", () => {
    expect(
      reductionQuorum([
        signal({ relevantTagTrustBps: 7_000 }),
        signal({ relevantTagTrustBps: 9_000 }),
      ]),
    ).toMatchObject({ clusterCount: 1, combinedTrustBps: 9_000, reductionSatisfied: false });
  });

  it.each([
    [5_999, 6_000, true, false],
    [6_000, 6_000, false, false],
    [6_000, 6_000, true, true],
  ])(
    "checks reduction trust %i + %i and proof %s",
    (leftTrust, rightTrust, proof, expected) => {
      expect(
        reductionQuorum([
          signal({ clusterId: "left", relevantTagTrustBps: leftTrust, machineVerifiedProof: proof }),
          signal({ clusterId: "right", relevantTagTrustBps: rightTrust, machineVerifiedProof: false }),
        ]).reductionSatisfied,
      ).toBe(expected);
    },
  );

  it("gives freeform and ineligible signals zero payout weight", () => {
    expect(
      reductionQuorum([
        signal({ clusterId: "a", relevantTagTrustBps: 10_000, freeform: true }),
        signal({ clusterId: "b", relevantTagTrustBps: 10_000, eligible: false }),
      ]),
    ).toMatchObject({ clusterCount: 0, combinedTrustBps: 0, reductionSatisfied: false });
  });

  it("requires verified pass proof for every required criterion", () => {
    expect(
      acceptanceQuorum({
        requiredCriterionIds: ["required", "other"],
        signals: [
          signal({
            clusterId: "a",
            relevantTagTrustBps: 8_000,
            criterionResults: { required: "passed" },
          }),
        ],
      }),
    ).toEqual({
      satisfied: false,
      combinedTrustBps: 8_000,
      missingProofCriterionIds: ["other"],
    });
  });
});

describe("harmful hold", () => {
  it("holds on one eligible machine-verified harmful proof at 8,000 trust", () => {
    expect(
      harmfulHold([
        signal({ harmful: true, relevantTagTrustBps: 8_000, machineVerifiedProof: true }),
      ]),
    ).toEqual({ hold: true, clusterId: "cluster-a", trustBps: 8_000 });
  });

  it.each([
    [{ relevantTagTrustBps: 7_999, harmful: true }, false],
    [{ relevantTagTrustBps: 8_000, harmful: false }, false],
    [{ relevantTagTrustBps: 8_000, harmful: true, machineVerifiedProof: false }, false],
  ] as const)("does not hold for incomplete signal %#", (overrides, expected) => {
    expect(harmfulHold([signal(overrides)]).hold).toBe(expected);
  });
});

describe("review reserve assignment", () => {
  it("never double-commits fees already held by an open assignment", () => {
    expect(nextReviewAssignmentFee(BigInt(100), [
      { state: "open", reserveFeeBaseUnits: BigInt(70) },
      { state: "declined", reserveFeeBaseUnits: BigInt(80) },
    ])).toBe(BigInt(30));
    expect(nextReviewAssignmentFee(BigInt(100), [
      { state: "accepted", reserveFeeBaseUnits: BigInt(70) },
      { state: "completed", reserveFeeBaseUnits: BigInt(30) },
    ])).toBe(BigInt(0));
  });
});
