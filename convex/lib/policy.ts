export type BasisPoints = number & { readonly __brand: "BasisPoints" };
export type BaseUnits = bigint & { readonly __brand: "BaseUnits" };

const BPS_DENOMINATOR = 10_000;
const SIX_DECIMAL_UNIT = BigInt(1_000_000);

export const basisPoints = (value: number): BasisPoints => {
  if (!Number.isInteger(value) || value < 0 || value > BPS_DENOMINATOR) {
    throw new RangeError("Basis points must be an integer from 0 to 10,000.");
  }
  return value as BasisPoints;
};

export const baseUnits = (value: bigint): BaseUnits => {
  if (value < BigInt(0)) {
    throw new RangeError("Base units cannot be negative.");
  }
  return value as BaseUnits;
};

export const bpsValue = (value: BasisPoints) => Number(value);
export const baseUnitValue = (value: BaseUnits) => BigInt(value);

export type RiskTier = "low" | "medium" | "high";

export interface MarketplacePolicy {
  version: 2;
  stablecoinDecimals: 6;
  highValueThreshold: BaseUnits;
  fundingDeadlineDefaultMs: number;
  fundingDeadlineMinMs: number;
  fundingDeadlineMaxMs: number;
  deliveryDefaultMs: number;
  deliveryMinMs: number;
  deliveryMaxMs: number;
  paymentIntentReservationMs: number;
  applicationWindowMs: Readonly<Record<RiskTier, number>>;
  evaluationWindowMs: Readonly<Record<RiskTier, number>>;
  insufficientEvidenceExtensionMs: number;
  revisionWindowMs: number;
  humanDisputeSloMs: number;
  platformFeeBps: BasisPoints;
  reductionTrustBps: number;
  reductionClusterCount: number;
  acceptanceTrustBps: number;
  harmfulHoldTrustBps: number;
  revisionPayoutCeilingBps: BasisPoints;
  evidenceRetentionMs: number;
  evidenceUploadLimitBytes: number;
  privilegedSessionMaxAgeMs: number;
  reputationHalfLifeDays: number;
  reputationTemporalFloor: number;
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

export const POLICY_V2: MarketplacePolicy = Object.freeze({
  version: 2,
  stablecoinDecimals: 6,
  highValueThreshold: baseUnits(BigInt(500) * SIX_DECIMAL_UNIT),
  fundingDeadlineDefaultMs: 14 * DAY_MS,
  fundingDeadlineMinMs: DAY_MS,
  fundingDeadlineMaxMs: 30 * DAY_MS,
  deliveryDefaultMs: 7 * DAY_MS,
  deliveryMinMs: DAY_MS,
  deliveryMaxMs: 30 * DAY_MS,
  paymentIntentReservationMs: 10 * 60 * 1_000,
  applicationWindowMs: Object.freeze({
    low: 6 * HOUR_MS,
    medium: 24 * HOUR_MS,
    high: 48 * HOUR_MS,
  }),
  evaluationWindowMs: Object.freeze({
    low: 24 * HOUR_MS,
    medium: 48 * HOUR_MS,
    high: 72 * HOUR_MS,
  }),
  insufficientEvidenceExtensionMs: 24 * HOUR_MS,
  revisionWindowMs: 72 * HOUR_MS,
  humanDisputeSloMs: 72 * HOUR_MS,
  platformFeeBps: basisPoints(100),
  reductionTrustBps: 12_000,
  reductionClusterCount: 2,
  acceptanceTrustBps: 8_000,
  harmfulHoldTrustBps: 8_000,
  revisionPayoutCeilingBps: basisPoints(9_000),
  evidenceRetentionMs: 180 * DAY_MS,
  evidenceUploadLimitBytes: 10 * 1_024 * 1_024,
  privilegedSessionMaxAgeMs: 10 * 60 * 1_000,
  reputationHalfLifeDays: 365,
  reputationTemporalFloor: 0.1,
});

export const getPolicy = (version: number): MarketplacePolicy => {
  if (version !== POLICY_V2.version) {
    throw new RangeError(`Unsupported policy version: ${version}.`);
  }
  return POLICY_V2;
};

export const riskTierForWorkEscrow = (workEscrow: BaseUnits): RiskTier => {
  const value = baseUnitValue(workEscrow);
  if (value < BigInt(100) * SIX_DECIMAL_UNIT) {
    return "low";
  }
  if (value < baseUnitValue(POLICY_V2.highValueThreshold)) {
    return "medium";
  }
  return "high";
};

const clampBigInt = (value: bigint, minimum: bigint, maximum: bigint) =>
  value < minimum ? minimum : value > maximum ? maximum : value;

export const reviewReserveFor = (workEscrow: BaseUnits): BaseUnits => {
  const value = baseUnitValue(workEscrow);
  const tier = riskTierForWorkEscrow(workEscrow);
  const numerator = tier === "high" ? BigInt(500) : BigInt(300);
  const minimum = BigInt(tier === "high" ? 25 : 5) * SIX_DECIMAL_UNIT;
  const maximum = BigInt(tier === "high" ? 100 : 25) * SIX_DECIMAL_UNIT;
  return baseUnits(clampBigInt((value * numerator) / BigInt(BPS_DENOMINATOR), minimum, maximum));
};

export type CriterionPassCondition =
  | { kind: "boolean_assertion"; assertion: string }
  | { kind: "numeric_threshold"; metric: string; operator: "gte" | "lte"; value: string }
  | { kind: "fixture_assertion"; fixtureVersion: string; assertion: string };

export interface ContractCriterion {
  id: string;
  title: string;
  passCondition: CriterionPassCondition;
  verificationMethod: string;
  weightBps: number;
  tags: readonly string[];
  requiredForPublication: boolean;
}

export type CriteriaValidation =
  | { valid: true; totalWeightBps: BasisPoints; requiredWeightBps: BasisPoints }
  | { valid: false; errors: readonly string[] };

export const validateCriteria = (criteria: readonly ContractCriterion[]): CriteriaValidation => {
  const errors: string[] = [];
  const ids = new Set<string>();
  let totalWeight = 0;
  let requiredWeight = 0;

  if (criteria.length === 0) {
    errors.push("At least one criterion is required.");
  }

  for (const criterion of criteria) {
    const id = criterion.id.trim();
    if (!id) {
      errors.push("Criterion IDs must be nonempty.");
    } else if (ids.has(id)) {
      errors.push(`Criterion ID ${id} is duplicated.`);
    }
    ids.add(id);

    if (!criterion.title.trim()) {
      errors.push(`Criterion ${id || "<unknown>"} needs a title.`);
    }
    if (!criterion.verificationMethod.trim()) {
      errors.push(`Criterion ${id || "<unknown>"} needs a verification method.`);
    }
    if (!Number.isInteger(criterion.weightBps) || criterion.weightBps <= 0) {
      errors.push(`Criterion ${id || "<unknown>"} needs a positive integer weight.`);
      continue;
    }
    totalWeight += criterion.weightBps;
    if (criterion.requiredForPublication) {
      requiredWeight += criterion.weightBps;
    }

    const condition = criterion.passCondition;
    if (condition.kind === "boolean_assertion" && !condition.assertion.trim()) {
      errors.push(`Criterion ${id || "<unknown>"} needs an observable assertion.`);
    }
    if (
      condition.kind === "numeric_threshold" &&
      (!condition.metric.trim() || !condition.value.trim())
    ) {
      errors.push(`Criterion ${id || "<unknown>"} needs a complete numeric threshold.`);
    }
    if (
      condition.kind === "fixture_assertion" &&
      (!condition.fixtureVersion.trim() || !condition.assertion.trim())
    ) {
      errors.push(`Criterion ${id || "<unknown>"} needs a fixture and assertion.`);
    }
  }

  if (totalWeight !== BPS_DENOMINATOR) {
    errors.push("Criterion weights must total exactly 10,000 bps.");
  }
  if (requiredWeight < 6_000) {
    errors.push("Required criteria must carry at least 6,000 bps.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    totalWeightBps: basisPoints(totalWeight),
    requiredWeightBps: basisPoints(requiredWeight),
  };
};

export type CriterionResult = "passed" | "failed" | "not_run";
export type RevisionStage = "first_version" | "revised" | "declined" | "missed";

export interface CriterionDecision {
  passedWeightBps: BasisPoints;
  multiplierBps: BasisPoints;
  grossAuthorBaseUnits: BaseUnits;
  publicationAllowed: boolean;
  revisionOffered: boolean;
  decision: "accept" | "request_revision" | "reject" | "block_harmful";
}

export const calculateCriterionDecision = (args: {
  workEscrow: BaseUnits;
  criteria: readonly ContractCriterion[];
  results: Readonly<Record<string, CriterionResult>>;
  revisionStage: RevisionStage;
  harmful: boolean;
}): CriterionDecision => {
  const validation = validateCriteria(args.criteria);
  if (!validation.valid) {
    throw new RangeError(validation.errors.join(" "));
  }

  if (args.harmful) {
    return {
      passedWeightBps: basisPoints(0),
      multiplierBps: basisPoints(0),
      grossAuthorBaseUnits: baseUnits(BigInt(0)),
      publicationAllowed: false,
      revisionOffered: false,
      decision: "block_harmful",
    };
  }

  let passedWeight = 0;
  let requiredFailed = false;
  for (const criterion of args.criteria) {
    const result = args.results[criterion.id] ?? "not_run";
    if (result === "passed") {
      passedWeight += criterion.weightBps;
    } else if (criterion.requiredForPublication) {
      requiredFailed = true;
    }
  }

  const onRevisionPath = args.revisionStage !== "first_version";
  const multiplier = onRevisionPath ? Math.min(passedWeight, 9_000) : passedWeight;
  const publicationAllowed = !requiredFailed && args.revisionStage !== "declined" && args.revisionStage !== "missed";
  const revisionOffered = requiredFailed && args.revisionStage === "first_version";
  const decision = publicationAllowed
    ? "accept"
    : revisionOffered
      ? "request_revision"
      : "reject";
  const gross =
    (baseUnitValue(args.workEscrow) * BigInt(multiplier)) / BigInt(BPS_DENOMINATOR);

  return {
    passedWeightBps: basisPoints(passedWeight),
    multiplierBps: basisPoints(multiplier),
    grossAuthorBaseUnits: baseUnits(gross),
    publicationAllowed,
    revisionOffered,
    decision,
  };
};
