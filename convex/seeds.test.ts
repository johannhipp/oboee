/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("development seeds", () => {
  it("creates only Moderato data through the internal API", async () => {
    const t = convexTest({ schema, modules });

    const result = await t.mutation(internal.seeds.seedCveDataset, {});
    expect(result.createdRfsIds).toHaveLength(4);

    const rows = await t.run((ctx) => ctx.db.query("rfs").collect());
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.fundingTokenAddress === "0x20c0000000000000000000000000000000000000")).toBe(true);
  });
});
