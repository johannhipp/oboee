import { describe, expect, it } from "vitest";

import {
  adoptionBps,
  bayesianReputationScore,
  confidenceAdjustedScore,
  confidenceForCount,
  discoveryScoreBps,
  ratingToScore,
  recencyBps,
  temporalDecay,
} from "./reputationPolicy";
import { basisPoints } from "./policy";

describe("reputation policy", () => {
  it("uses a 365-day half-life with a ten-percent floor", () => {
    expect(temporalDecay(0)).toBe(1);
    expect(temporalDecay(365)).toBeCloseTo(0.5);
    expect(temporalDecay(10_000)).toBe(0.1);
  });

  it("uses a neutral prior and ignores correlated duplicate signals", () => {
    expect(bayesianReputationScore([])).toBe(50);
    expect(
      bayesianReputationScore([
        { score: 100, signalStrength: 1, ageDays: 0, independent: true },
        { score: 0, signalStrength: 1, ageDays: 0, independent: false },
      ]),
    ).toBe(62.5);
  });

  it.each([
    [0, "provisional"],
    [2, "provisional"],
    [3, "low"],
    [8, "medium"],
    [20, "high"],
  ] as const)("maps %i outcomes to %s confidence", (count, expected) => {
    expect(confidenceForCount(count)).toBe(expected);
  });

  it.each([
    ["provisional", 62.5],
    ["low", 75],
    ["medium", 90],
    ["high", 100],
  ] as const)("shrinks a score for %s confidence", (confidence, expected) => {
    expect(confidenceAdjustedScore(100, confidence)).toBe(expected);
  });

  it("maps ratings to the fixed score scale", () => {
    expect([1, 2, 3, 4, 5].map((rating) => ratingToScore(rating as 1 | 2 | 3 | 4 | 5))).toEqual([
      0,
      25,
      50,
      75,
      100,
    ]);
  });
});

describe("discovery policy", () => {
  it("normalizes adoption, bounds recency, and applies 45/45/10", () => {
    expect(adoptionBps(0, 10)).toBe(0);
    expect(adoptionBps(10, 10)).toBe(10_000);
    expect(recencyBps(0)).toBe(10_000);
    expect(recencyBps(180)).toBe(0);
    expect(
      discoveryScoreBps({
        qualityBps: basisPoints(10_000),
        adoptionBps: basisPoints(0),
        recencyBps: basisPoints(10_000),
      }),
    ).toBe(5_500);
  });
});
