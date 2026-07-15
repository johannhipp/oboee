/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Convex schema", () => {
  it("loads bigint fields and indexes without a deployment", async () => {
    const t = convexTest({ schema, modules });
    const rfsId = await t.run((ctx) =>
      ctx.db.insert("rfs", {
        authorUserId: "schema-test-author",
        title: "Schema smoke test",
        description: "Exercises the current request schema.",
        scope: "Local test database only.",
        tags: ["schema"],
        fundingThresholdBaseUnits: BigInt(9_000),
        minimumContributionBaseUnits: BigInt(1),
        currentAmountBaseUnits: BigInt(0),
        fundingTokenAddress:
          "0x20c0000000000000000000000000000000000000",
        status: "open",
      }),
    );

    const inserted = await t.run((ctx) => ctx.db.get(rfsId));
    const indexed = await t.run((ctx) =>
      ctx.db
        .query("rfs")
        .withIndex("by_status", (query) => query.eq("status", "open"))
        .unique(),
    );

    expect(inserted?.fundingThresholdBaseUnits).toBe(BigInt(9_000));
    expect(indexed?._id).toBe(rfsId);
  });
});
