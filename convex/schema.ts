import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rfs: defineTable({
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
    status: v.union(
      v.literal("open"),
      v.literal("funded"),
      v.literal("fulfilled"),
      v.literal("published"),
      v.literal("cancelled"),
    ),
  })
    .index("by_status", ["status"])
    .index("by_author", ["authorUserId"])
    .index("by_claimant", ["claimantUserId"]),

  contributions: defineTable({
    rfsId: v.id("rfs"),
    backerUserId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_backer", ["backerUserId"])
    .index("by_challengeId", ["challengeId"]),

  skills: defineTable({
    rfsId: v.id("rfs"),
    authorUserId: v.string(),
    contentMarkdown: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    purchasePriceBaseUnits: v.int64(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("published"),
    ),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_status", ["status"]),

  purchases: defineTable({
    skillId: v.id("skills"),
    buyerUserId: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
  })
    .index("by_skill", ["skillId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_challengeId", ["challengeId"]),

  accessGrants: defineTable({
    userId: v.string(),
    skillId: v.id("skills"),
    source: v.union(
      v.literal("backer_unlock"),
      v.literal("purchase"),
      v.literal("admin"),
    ),
  })
    .index("by_user_skill", ["userId", "skillId"])
    .index("by_skill", ["skillId"]),

  payoutLedger: defineTable({
    rfsId: v.id("rfs"),
    researcherUserId: v.string(),
    grossAmountBaseUnits: v.int64(),
    platformFeeBaseUnits: v.int64(),
    netAmountBaseUnits: v.int64(),
    status: v.union(
      v.literal("locked"),
      v.literal("claimable"),
      v.literal("claimed"),
    ),
    receiptReference: v.optional(v.string()),
  })
    .index("by_rfs", ["rfsId"])
    .index("by_researcher", ["researcherUserId"])
    .index("by_status", ["status"]),

  payoutEntries: defineTable({
    rfsId: v.id("rfs"),
    researcherUserId: v.string(),
    source: v.union(v.literal("funding"), v.literal("purchase")),
    grossAmountBaseUnits: v.int64(),
    platformFeeBaseUnits: v.int64(),
    netAmountBaseUnits: v.int64(),
    status: v.union(v.literal("claimable"), v.literal("claimed")),
    claimGroupId: v.optional(v.string()),
  })
    .index("by_researcher_status", ["researcherUserId", "status"])
    .index("by_rfs", ["rfsId"])
    .index("by_claimGroup", ["claimGroupId"]),

  paymentEvents: defineTable({
    type: v.union(
      v.literal("fund"),
      v.literal("buy"),
      v.literal("payout_claim"),
    ),
    resourceId: v.string(),
    challengeId: v.string(),
    receiptReference: v.string(),
    amountBaseUnits: v.int64(),
    currencyAddress: v.string(),
    status: v.string(),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_type_resource", ["type", "resourceId"]),
});
