import { describe, expect, it } from "vitest";

import {
  assignmentPenalty,
  authorBondAmount,
  bondSlashBps,
  compareCandidates,
  criterionCoverageBps,
  logNormalizedBps,
  reliabilityBps,
  requiresAuthorBond,
  stakeholderPreferenceBps,
  totalAssignmentScore,
} from "./assignmentPolicy";
import { baseUnits, basisPoints } from "./policy";

const unit = BigInt(1_000_000);

describe("assignment components", () => {
  it.each([
    [0, 0, 5_000],
    [1, 1, 6_666],
    [9, 10, 8_333],
  ])("shrinks reliability %i/%i to %i", (onTime, finalized, expected) => {
    expect(reliabilityBps(onTime, finalized)).toBe(expected);
  });

  it("normalizes relevant work and caps it", () => {
    expect(logNormalizedBps(0, 20)).toBe(0);
    expect(logNormalizedBps(20, 20)).toBe(10_000);
    expect(logNormalizedBps(200, 20)).toBe(10_000);
  });

  it("counts only complete criterion plans", () => {
    expect(
      criterionCoverageBps([
        {
          weightBps: basisPoints(6_000),
          hasExecutionMethod: true,
          hasExpectedResult: true,
          hasEnvironment: true,
          hasEvidenceType: true,
          hasEta: true,
        },
        {
          weightBps: basisPoints(4_000),
          hasExecutionMethod: true,
          hasExpectedResult: false,
          hasEnvironment: true,
          hasEvidenceType: true,
          hasEta: true,
        },
      ]),
    ).toBe(6_000);
  });

  it("cluster-caps endorsements and excludes the applicant cluster", () => {
    const preference = stakeholderPreferenceBps({
      requesterEndorsed: true,
      applicantClusterId: "applicant",
      contributions: [
        { clusterId: "a", amountBaseUnits: baseUnits(BigInt(10)), endorsed: true },
        { clusterId: "a", amountBaseUnits: baseUnits(BigInt(20)), endorsed: true },
        { clusterId: "applicant", amountBaseUnits: baseUnits(BigInt(30)), endorsed: true },
        { clusterId: "b", amountBaseUnits: baseUnits(BigInt(50)), endorsed: false },
      ],
    });
    expect(preference).toBe(6_000);
  });

  it("uses the documented 45/20/10/10/10/5 weighting", () => {
    expect(
      totalAssignmentScore({
        tagQualityBps: basisPoints(10_000),
        reliabilityBps: basisPoints(0),
        relevantWorkBps: basisPoints(10_000),
        downstreamBps: basisPoints(0),
        coverageBps: basisPoints(10_000),
        preferenceBps: basisPoints(0),
        penaltyBps: basisPoints(500),
      }),
    ).toBe(6_000);
  });
});

describe("eligibility, ties, and bonds", () => {
  it.each([
    [0, 0],
    [1, 500],
    [2, 1_500],
  ])("maps %i recent abandonments to %i bps", (count, expected) => {
    expect(assignmentPenalty({ abandonmentCountLast12Months: count })).toEqual({
      eligible: true,
      penaltyBps: expected,
    });
  });

  it("makes recent finalized harm ineligible and older harm a fixed penalty", () => {
    expect(
      assignmentPenalty({
        abandonmentCountLast12Months: 0,
        finalizedRestriction: { kind: "harmful", ageDays: 100 },
      }),
    ).toEqual({ eligible: false, reason: "harmful" });
    expect(
      assignmentPenalty({
        abandonmentCountLast12Months: 0,
        finalizedRestriction: { kind: "harmful", ageDays: 500 },
      }),
    ).toEqual({ eligible: true, penaltyBps: 2_000 });
  });

  it("breaks ties by confidence, work, time, then stable ID", () => {
    const candidates = [
      { applicationId: "b", scoreBps: basisPoints(8_000), confidence: "medium" as const, relevantFinalizedWork: 3, submittedAt: 1 },
      { applicationId: "a", scoreBps: basisPoints(8_000), confidence: "high" as const, relevantFinalizedWork: 1, submittedAt: 2 },
      { applicationId: "c", scoreBps: basisPoints(8_000), confidence: "high" as const, relevantFinalizedWork: 1, submittedAt: 3 },
    ];
    expect(candidates.sort(compareCandidates).map((candidate) => candidate.applicationId)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("requires and clamps a high-value weak-reputation bond", () => {
    expect(
      requiresAuthorBond(baseUnits(BigInt(500) * unit), [
        {
          adjustedScore: 79,
          confidence: "high",
          unresolvedHarmfulDispute: false,
          abandonmentRate: 0,
        },
      ]),
    ).toBe(true);
    expect(authorBondAmount(baseUnits(BigInt(500) * unit))).toBe(BigInt(25) * unit);
    expect(authorBondAmount(baseUnits(BigInt(10_000) * unit))).toBe(BigInt(100) * unit);
  });

  it.each([
    ["accepted", undefined, 0],
    ["ordinary_reduced_quality", undefined, 0],
    ["first_abandonment", false, 5_000],
    ["first_abandonment", true, 0],
    ["repeated_abandonment", undefined, 10_000],
    ["fraud", undefined, 10_000],
    ["harmful", undefined, 10_000],
  ] as const)("applies fixed bond resolution %s", (resolution, forceMajeureAccepted, expected) => {
    expect(bondSlashBps({ resolution, forceMajeureAccepted })).toBe(expected);
  });
});
