export const RFS_STATUSES = ["open", "funded", "published"] as const;
export type RfsStatus = (typeof RFS_STATUSES)[number];

export const SKILL_STATUSES = ["published"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const PAYMENT_EVENT_TYPES = ["fund", "buy"] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export const EARNING_SOURCE_KINDS = ["funding", "purchase"] as const;
export type EarningSourceKind = (typeof EARNING_SOURCE_KINDS)[number];
