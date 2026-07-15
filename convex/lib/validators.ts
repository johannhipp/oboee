import { v } from "convex/values";

import {
  EARNING_SOURCE_KINDS,
  PAYMENT_EVENT_TYPES,
  RFS_STATUSES,
  SKILL_STATUSES,
} from "../../shared/domain/status";

export const rfsStatusValidator = v.union(
  v.literal(RFS_STATUSES[0]),
  v.literal(RFS_STATUSES[1]),
  v.literal(RFS_STATUSES[2]),
);

export const skillStatusValidator = v.literal(SKILL_STATUSES[0]);
export const paymentEventTypeValidator = v.union(
  v.literal(PAYMENT_EVENT_TYPES[0]),
  v.literal(PAYMENT_EVENT_TYPES[1]),
);
export const earningSourceKindValidator = v.union(
  v.literal(EARNING_SOURCE_KINDS[0]),
  v.literal(EARNING_SOURCE_KINDS[1]),
);

export const rfsFields = {
  authorUserId: v.string(),
  claimantUserId: v.optional(v.string()),
  title: v.string(),
  description: v.string(),
  scope: v.string(),
  tags: v.array(v.string()),
  fundingThresholdBaseUnits: v.int64(),
  minimumContributionBaseUnits: v.int64(),
  currentAmountBaseUnits: v.int64(),
  fundingTokenAddress: v.string(),
  status: rfsStatusValidator,
};

export const rfsDocValidator = v.object({
  _id: v.id("rfs"),
  _creationTime: v.number(),
  ...rfsFields,
});

export const skillFields = {
  rfsId: v.id("rfs"),
  authorUserId: v.string(),
  contentMarkdown: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  purchasePriceBaseUnits: v.int64(),
  status: skillStatusValidator,
};

export const skillDocValidator = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  ...skillFields,
});

export const contributionFields = {
  rfsId: v.id("rfs"),
  backerUserId: v.optional(v.string()),
  anonymousPaymentReference: v.optional(v.string()),
  amountBaseUnits: v.int64(),
  currencyAddress: v.string(),
  challengeId: v.string(),
  receiptReference: v.string(),
  status: v.literal("accepted"),
};

export const purchaseFields = {
  skillId: v.id("skills"),
  buyerUserId: v.optional(v.string()),
  anonymousPaymentReference: v.optional(v.string()),
  amountBaseUnits: v.int64(),
  currencyAddress: v.string(),
  challengeId: v.string(),
  receiptReference: v.string(),
};

export const earningEntryFields = {
  sourceKey: v.string(),
  rfsId: v.id("rfs"),
  researcherUserId: v.string(),
  sourceKind: earningSourceKindValidator,
  purchaseId: v.optional(v.id("purchases")),
  grossAmountBaseUnits: v.int64(),
  platformFeeBaseUnits: v.int64(),
  netAmountBaseUnits: v.int64(),
  currencyAddress: v.string(),
};

export const paymentEventFields = {
  type: paymentEventTypeValidator,
  resourceId: v.string(),
  challengeId: v.string(),
  receiptReference: v.string(),
  amountBaseUnits: v.int64(),
  currencyAddress: v.string(),
  status: v.string(),
};
