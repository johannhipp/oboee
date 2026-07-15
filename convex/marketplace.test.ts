/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TOKEN = "0x20c0000000000000000000000000000000000000";

describe("marketplace read model", () => {
  it("returns bounded, searchable discriminated metadata without paid content", async () => {
    const t = convexTest({ schema, modules });
    const { openRfsId, publishedRfsId, skillId } = await t.run(async (ctx) => {
      const base = {
        authorUserId: "author",
        description: "Origin desynchronization research",
        scope: "Gateway defenses",
        tags: ["security", "http"],
        fundingThresholdBaseUnits: BigInt(9_000),
        minimumContributionBaseUnits: BigInt(1),
        currentAmountBaseUnits: BigInt(0),
        fundingTokenAddress: TOKEN,
      };
      const openRfsId = await ctx.db.insert("rfs", {
        ...base,
        title: "Open request",
        status: "open",
      });
      const publishedRfsId = await ctx.db.insert("rfs", {
        ...base,
        title: "Published request",
        currentAmountBaseUnits: BigInt(9_000),
        status: "published",
      });
      const skillId = await ctx.db.insert("skills", {
        rfsId: publishedRfsId,
        authorUserId: "author",
        contentMarkdown: "# Secret paid content",
        summary: "Rapid Reset response playbook",
        tags: ["security", "http2"],
        purchasePriceBaseUnits: BigInt(5_000),
        status: "published",
      });
      return { openRfsId, publishedRfsId, skillId };
    });

    const first = await t.query(anyApi.marketplace.list, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.isDone).toBe(false);
    const second = await t.query(anyApi.marketplace.list, {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.itemId))).toEqual(
      new Set([openRfsId, skillId]),
    );

    const search = await t.query(anyApi.marketplace.list, {
      q: "rapid reset",
      tags: [" SECURITY ", "http2"],
      limit: 10,
    });
    expect(search.items).toHaveLength(1);
    expect(search.items[0]).toMatchObject({
      kind: "skill",
      itemId: skillId,
      skillId,
      rfsId: publishedRfsId,
      detailHref: `/browse/${publishedRfsId}`,
    });
    expect(search.items[0]).not.toHaveProperty("contentMarkdown");
  });
});
