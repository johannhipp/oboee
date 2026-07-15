/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { recordEarning } from "./lib/earnings";
import { purchaseEarningSourceKey } from "./lib/rfsDomain";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "0x20c0000000000000000000000000000000000000";

describe("earnings", () => {
  it("records one immutable entry for each stable source", async () => {
    const t = convexTest({ schema, modules });
    const source = await t.run(async (ctx) => {
      const rfsId = await ctx.db.insert("rfs", {
        authorUserId: "author",
        title: "Earnings request",
        description: "Description",
        scope: "Scope",
        tags: [],
        fundingThresholdBaseUnits: BigInt(1_000),
        minimumContributionBaseUnits: BigInt(1),
        currentAmountBaseUnits: BigInt(1_000),
        fundingTokenAddress: TOKEN,
        status: "published",
      });
      const skillId = await ctx.db.insert("skills", {
        rfsId,
        authorUserId: "author",
        contentMarkdown: "# Paid",
        summary: "Summary",
        tags: [],
        purchasePriceBaseUnits: BigInt(500),
        status: "published",
      });
      const purchaseId = await ctx.db.insert("purchases", {
        skillId,
        buyerUserId: "buyer",
        amountBaseUnits: BigInt(500),
        currencyAddress: TOKEN,
        challengeId: "earning-test-purchase",
        receiptReference: "0xreceipt",
      });
      return { purchaseId, rfsId };
    });

    const input = {
      sourceKey: purchaseEarningSourceKey(source.purchaseId),
      rfsId: source.rfsId,
      researcherUserId: "author",
      sourceKind: "purchase" as const,
      purchaseId: source.purchaseId,
      grossAmountBaseUnits: BigInt(500),
      currencyAddress: TOKEN,
    };
    const first = await t.run((ctx) => recordEarning(ctx, input));
    const retry = await t.run((ctx) => recordEarning(ctx, input));
    const rows = await t.run((ctx) => ctx.db.query("earningEntries").collect());

    expect(retry).toBe(first);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceKey: input.sourceKey,
      sourceKind: "purchase",
      grossAmountBaseUnits: BigInt(500),
      platformFeeBaseUnits: BigInt(5),
      netAmountBaseUnits: BigInt(495),
    });
  });
});
