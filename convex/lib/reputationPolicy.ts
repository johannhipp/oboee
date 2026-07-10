import { basisPoints, type BasisPoints, POLICY_V2 } from "./policy";

export type ConfidenceLabel = "provisional" | "low" | "medium" | "high";

export interface ReputationSignal {
  score: number;
  signalStrength: number;
  ageDays: number;
  independent: boolean;
}

export const temporalDecay = (ageDays: number) => {
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    throw new RangeError("Age must be a nonnegative finite day count.");
  }
  return Math.max(
    POLICY_V2.reputationTemporalFloor,
    Math.pow(2, -ageDays / POLICY_V2.reputationHalfLifeDays),
  );
};

export const bayesianReputationScore = (signals: readonly ReputationSignal[]) => {
  let weightedScore = 3 * 50;
  let totalWeight = 3;
  for (const signal of signals) {
    if (
      !Number.isFinite(signal.score) ||
      signal.score < 0 ||
      signal.score > 100 ||
      !Number.isFinite(signal.signalStrength) ||
      signal.signalStrength < 0
    ) {
      throw new RangeError("Reputation signal is outside the supported range.");
    }
    const weight = signal.independent
      ? signal.signalStrength * temporalDecay(signal.ageDays)
      : 0;
    weightedScore += weight * signal.score;
    totalWeight += weight;
  }
  return weightedScore / totalWeight;
};

export const confidenceForCount = (count: number): ConfidenceLabel => {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Confidence count must be a nonnegative integer.");
  }
  if (count <= 2) return "provisional";
  if (count <= 7) return "low";
  if (count <= 19) return "medium";
  return "high";
};

export const confidenceAdjustedScore = (score: number, confidence: ConfidenceLabel) => {
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new RangeError("Score must be from 0 to 100.");
  }
  const factor: Readonly<Record<ConfidenceLabel, number>> = {
    provisional: 0.25,
    low: 0.5,
    medium: 0.8,
    high: 1,
  };
  return 50 + factor[confidence] * (score - 50);
};

export const ratingToScore = (rating: 1 | 2 | 3 | 4 | 5) => (rating - 1) * 25;

export const adoptionBps = (adoptionUnits: number, categoryP95: number): BasisPoints => {
  if (adoptionUnits < 0 || categoryP95 < 0) {
    throw new RangeError("Adoption values cannot be negative.");
  }
  const denominator = Math.log1p(Math.max(1, categoryP95));
  return basisPoints(
    Math.max(0, Math.min(10_000, Math.floor((10_000 * Math.log1p(adoptionUnits)) / denominator))),
  );
};

export const recencyBps = (ageDays: number): BasisPoints => {
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    throw new RangeError("Age must be nonnegative.");
  }
  return basisPoints(Math.max(0, Math.min(10_000, Math.floor(10_000 * (1 - ageDays / 180)))));
};

export const discoveryScoreBps = (args: {
  qualityBps: BasisPoints;
  adoptionBps: BasisPoints;
  recencyBps: BasisPoints;
}): BasisPoints =>
  basisPoints(
    Math.floor(
      (45 * Number(args.qualityBps) +
        45 * Number(args.adoptionBps) +
        10 * Number(args.recencyBps)) /
        100,
    ),
  );
