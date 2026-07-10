import {
  baseUnits,
  baseUnitValue,
  basisPoints,
  type BaseUnits,
  type BasisPoints,
  POLICY_V2,
} from "./policy";

const clampBps = (value: number) => basisPoints(Math.max(0, Math.min(10_000, Math.floor(value))));

export const reliabilityBps = (onTime: number, eligibleFinalized: number): BasisPoints => {
  if (!Number.isInteger(onTime) || !Number.isInteger(eligibleFinalized)) {
    throw new RangeError("Reliability counts must be integers.");
  }
  if (onTime < 0 || eligibleFinalized < 0 || onTime > eligibleFinalized) {
    throw new RangeError("Reliability counts are inconsistent.");
  }
  return clampBps((10_000 * (onTime + 1)) / (eligibleFinalized + 2));
};

export const logNormalizedBps = (count: number, reference: number): BasisPoints => {
  if (!Number.isFinite(count) || !Number.isFinite(reference) || count < 0 || reference < 0) {
    throw new RangeError("Log-normalized values must be nonnegative and finite.");
  }
  const denominator = Math.log1p(Math.max(1, reference));
  return clampBps((10_000 * Math.log1p(count)) / denominator);
};

export interface CriterionPlanCoverage {
  weightBps: BasisPoints;
  hasExecutionMethod: boolean;
  hasExpectedResult: boolean;
  hasEnvironment: boolean;
  hasEvidenceType: boolean;
  hasEta: boolean;
}

export const criterionCoverageBps = (plans: readonly CriterionPlanCoverage[]): BasisPoints => {
  const covered = plans.reduce(
    (total, plan) =>
      total +
      (plan.hasExecutionMethod &&
      plan.hasExpectedResult &&
      plan.hasEnvironment &&
      plan.hasEvidenceType &&
      plan.hasEta
        ? Number(plan.weightBps)
        : 0),
    0,
  );
  return clampBps(covered);
};

export interface EndorsementContribution {
  clusterId: string;
  amountBaseUnits: BaseUnits;
  endorsed: boolean;
}

export const stakeholderPreferenceBps = (args: {
  requesterEndorsed: boolean;
  applicantClusterId: string;
  contributions: readonly EndorsementContribution[];
}): BasisPoints => {
  const highestByCluster = new Map<string, EndorsementContribution>();
  for (const contribution of args.contributions) {
    const existing = highestByCluster.get(contribution.clusterId);
    if (
      !existing ||
      baseUnitValue(contribution.amountBaseUnits) > baseUnitValue(existing.amountBaseUnits)
    ) {
      highestByCluster.set(contribution.clusterId, contribution);
    }
  }

  let total = BigInt(0);
  let endorsed = BigInt(0);
  for (const contribution of highestByCluster.values()) {
    const amount = baseUnitValue(contribution.amountBaseUnits);
    total += amount;
    if (contribution.endorsed && contribution.clusterId !== args.applicantClusterId) {
      endorsed += amount;
    }
  }
  const backerComponent = total === BigInt(0) ? 0 : Number((BigInt(5_000) * endorsed) / total);
  return clampBps((args.requesterEndorsed ? 5_000 : 0) + backerComponent);
};

export interface AssignmentScoreComponents {
  tagQualityBps: BasisPoints;
  reliabilityBps: BasisPoints;
  relevantWorkBps: BasisPoints;
  downstreamBps: BasisPoints;
  coverageBps: BasisPoints;
  preferenceBps: BasisPoints;
  penaltyBps: BasisPoints;
}

export const totalAssignmentScore = (components: AssignmentScoreComponents): BasisPoints =>
  clampBps(
    (45 * Number(components.tagQualityBps) +
      20 * Number(components.reliabilityBps) +
      10 * Number(components.relevantWorkBps) +
      10 * Number(components.downstreamBps) +
      10 * Number(components.coverageBps) +
      5 * Number(components.preferenceBps)) /
      100 -
      Number(components.penaltyBps),
  );

export type AssignmentRestriction = "harmful" | "fraud";

export const assignmentPenalty = (args: {
  abandonmentCountLast12Months: number;
  finalizedRestriction?: { kind: AssignmentRestriction; ageDays: number };
}): { eligible: true; penaltyBps: BasisPoints } | { eligible: false; reason: AssignmentRestriction } => {
  if (args.finalizedRestriction && args.finalizedRestriction.ageDays < 365) {
    return { eligible: false, reason: args.finalizedRestriction.kind };
  }
  if (args.finalizedRestriction && args.finalizedRestriction.ageDays < 730) {
    return { eligible: true, penaltyBps: basisPoints(2_000) };
  }
  return {
    eligible: true,
    penaltyBps: basisPoints(args.abandonmentCountLast12Months >= 2 ? 1_500 : args.abandonmentCountLast12Months === 1 ? 500 : 0),
  };
};

export type ReputationConfidence = "provisional" | "low" | "medium" | "high";

export interface RankedCandidate {
  applicationId: string;
  scoreBps: BasisPoints;
  confidence: ReputationConfidence;
  relevantFinalizedWork: number;
  submittedAt: number;
}

const confidenceRank: Readonly<Record<ReputationConfidence, number>> = {
  provisional: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export const compareCandidates = (left: RankedCandidate, right: RankedCandidate) => {
  if (left.scoreBps !== right.scoreBps) {
    return Number(right.scoreBps) - Number(left.scoreBps);
  }
  if (left.confidence !== right.confidence) {
    return confidenceRank[right.confidence] - confidenceRank[left.confidence];
  }
  if (left.relevantFinalizedWork !== right.relevantFinalizedWork) {
    return right.relevantFinalizedWork - left.relevantFinalizedWork;
  }
  if (left.submittedAt !== right.submittedAt) {
    return left.submittedAt - right.submittedAt;
  }
  return left.applicationId.localeCompare(right.applicationId);
};

export interface RequiredTagReputation {
  adjustedScore: number;
  confidence: ReputationConfidence;
  unresolvedHarmfulDispute: boolean;
  abandonmentRate: number;
}

const isStrongTagReputation = (reputation: RequiredTagReputation) =>
  reputation.adjustedScore >= 80 &&
  (reputation.confidence === "medium" || reputation.confidence === "high") &&
  !reputation.unresolvedHarmfulDispute &&
  reputation.abandonmentRate < 0.05;

export const requiresAuthorBond = (
  workEscrow: BaseUnits,
  requiredTagReputations: readonly RequiredTagReputation[],
) =>
  baseUnitValue(workEscrow) >= baseUnitValue(POLICY_V2.highValueThreshold) &&
  requiredTagReputations.some((reputation) => !isStrongTagReputation(reputation));

export const authorBondAmount = (workEscrow: BaseUnits): BaseUnits => {
  const unit = BigInt(1_000_000);
  const calculated = (baseUnitValue(workEscrow) * BigInt(500)) / BigInt(10_000);
  const minimum = BigInt(10) * unit;
  const maximum = BigInt(100) * unit;
  return baseUnits(calculated < minimum ? minimum : calculated > maximum ? maximum : calculated);
};

export type BondResolution =
  | "accepted"
  | "ordinary_reduced_quality"
  | "ordinary_rejection"
  | "first_abandonment"
  | "repeated_abandonment"
  | "fraud"
  | "harmful";

export const bondSlashBps = (args: {
  resolution: BondResolution;
  forceMajeureAccepted?: boolean;
}): BasisPoints => {
  if (args.resolution === "first_abandonment" && !args.forceMajeureAccepted) {
    return basisPoints(5_000);
  }
  if (
    args.resolution === "repeated_abandonment" ||
    args.resolution === "fraud" ||
    args.resolution === "harmful"
  ) {
    return basisPoints(10_000);
  }
  return basisPoints(0);
};
