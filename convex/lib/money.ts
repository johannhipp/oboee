import {
  baseUnits,
  baseUnitValue,
  type BaseUnits,
  type BasisPoints,
  POLICY_V2,
} from "./policy";

export interface ContributionShare {
  contributionId: string;
  amountBaseUnits: BaseUnits;
}

export interface RefundAllocation {
  contributionId: string;
  amountBaseUnits: BaseUnits;
}

export const allocateLargestRemainder = (
  pool: BaseUnits,
  contributions: readonly ContributionShare[],
): readonly RefundAllocation[] => {
  const ids = new Set(contributions.map((contribution) => contribution.contributionId));
  if (ids.size !== contributions.length) {
    throw new RangeError("Contribution IDs must be unique.");
  }
  const total = contributions.reduce(
    (sum, contribution) => sum + baseUnitValue(contribution.amountBaseUnits),
    BigInt(0),
  );
  if (baseUnitValue(pool) > BigInt(0) && total === BigInt(0)) {
    throw new RangeError("A positive pool requires positive contributions.");
  }
  if (contributions.length === 0) {
    return [];
  }

  const rows = contributions.map((contribution) => {
    const numerator = baseUnitValue(pool) * baseUnitValue(contribution.amountBaseUnits);
    return {
      contributionId: contribution.contributionId,
      floor: total === BigInt(0) ? BigInt(0) : numerator / total,
      remainder: total === BigInt(0) ? BigInt(0) : numerator % total,
    };
  });
  const allocated = rows.reduce((sum, row) => sum + row.floor, BigInt(0));
  let unitsLeft = baseUnitValue(pool) - allocated;
  const order = [...rows].sort((left, right) => {
    if (left.remainder !== right.remainder) {
      return left.remainder > right.remainder ? -1 : 1;
    }
    return left.contributionId.localeCompare(right.contributionId);
  });
  const extras = new Set<string>();
  for (const row of order) {
    if (unitsLeft === BigInt(0)) {
      break;
    }
    extras.add(row.contributionId);
    unitsLeft -= BigInt(1);
  }

  return rows
    .map((row) => ({
      contributionId: row.contributionId,
      amountBaseUnits: baseUnits(row.floor + (extras.has(row.contributionId) ? BigInt(1) : BigInt(0))),
    }))
    .sort((left, right) => left.contributionId.localeCompare(right.contributionId));
};

export interface SettlementPools {
  grossAuthorBaseUnits: BaseUnits;
  platformFeeBaseUnits: BaseUnits;
  netAuthorBaseUnits: BaseUnits;
  unusedReviewReserveBaseUnits: BaseUnits;
  refundPoolBaseUnits: BaseUnits;
}

export const calculateSettlementPools = (args: {
  workEscrow: BaseUnits;
  reviewReserve: BaseUnits;
  finalMultiplierBps: BasisPoints;
  committedReviewerFees: BaseUnits;
  slashedBond: BaseUnits;
}): SettlementPools => {
  if (baseUnitValue(args.committedReviewerFees) > baseUnitValue(args.reviewReserve)) {
    throw new RangeError("Committed reviewer fees exceed the review reserve.");
  }
  const grossAuthor =
    (baseUnitValue(args.workEscrow) * BigInt(Number(args.finalMultiplierBps))) / BigInt(10_000);
  const platformFee =
    (grossAuthor * BigInt(Number(POLICY_V2.platformFeeBps))) / BigInt(10_000);
  const netAuthor = grossAuthor - platformFee;
  const unusedReviewReserve =
    baseUnitValue(args.reviewReserve) - baseUnitValue(args.committedReviewerFees);
  const refundPool =
    baseUnitValue(args.workEscrow) -
    grossAuthor +
    unusedReviewReserve +
    baseUnitValue(args.slashedBond);

  return {
    grossAuthorBaseUnits: baseUnits(grossAuthor),
    platformFeeBaseUnits: baseUnits(platformFee),
    netAuthorBaseUnits: baseUnits(netAuthor),
    unusedReviewReserveBaseUnits: baseUnits(unusedReviewReserve),
    refundPoolBaseUnits: baseUnits(refundPool),
  };
};
