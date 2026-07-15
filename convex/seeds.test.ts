/// <reference types="vite/client" />

import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SEED_SECRET = "seed-secret-0123456789abcdef012345";

process.env.OBOE_SEED_SECRET = SEED_SECRET;

describe("development seeds", () => {
  it("rejects public callers and creates only Moderato data for an authorized run", async () => {
    const t = convexTest({ schema, modules });

    await expect(
      t.mutation(anyApi.seeds.seedCveDataset, { seedSecret: "wrong" }),
    ).rejects.toThrow("FORBIDDEN");

    const result = await t.mutation(anyApi.seeds.seedCveDataset, {
      seedSecret: SEED_SECRET,
    });
    expect(result.createdRfsIds).toHaveLength(4);

    const rows = await t.run((ctx) => ctx.db.query("rfs").collect());
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.fundingTokenAddress === "0x20c0000000000000000000000000000000000000")).toBe(true);
  });
});
