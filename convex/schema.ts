import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  contributionFields,
  earningEntryFields,
  paymentEventFields,
  purchaseFields,
  rfsFields,
  skillFields,
} from "./lib/validators";

export default defineSchema({
  rfs: defineTable(rfsFields)
    .index("by_status", ["status"])
    .index("by_author", ["authorUserId"])
    .index("by_claimant", ["claimantUserId"]),

  contributions: defineTable(contributionFields)
    .index("by_rfs", ["rfsId"])
    .index("by_backer", ["backerUserId"])
    .index("by_challengeId", ["challengeId"]),

  skills: defineTable(skillFields)
    .index("by_rfs", ["rfsId"])
    .index("by_status", ["status"]),

  purchases: defineTable(purchaseFields)
    .index("by_skill", ["skillId"])
    .index("by_buyer", ["buyerUserId"])
    .index("by_challengeId", ["challengeId"]),

  accessGrants: defineTable({
    userId: v.string(),
    skillId: v.id("skills"),
    source: v.union(
      v.literal("backer_unlock"),
      v.literal("purchase"),
    ),
  })
    .index("by_user_skill", ["userId", "skillId"])
    .index("by_skill", ["skillId"]),

  payoutWallets: defineTable({
    userId: v.string(),
    walletAddress: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  earningEntries: defineTable(earningEntryFields)
    .index("by_source_key", ["sourceKey"])
    .index("by_researcher_currency", ["researcherUserId", "currencyAddress"])
    .index("by_rfs", ["rfsId"]),

  paymentEvents: defineTable(paymentEventFields)
    .index("by_challengeId", ["challengeId"])
    .index("by_type_resource", ["type", "resourceId"]),
});
