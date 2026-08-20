/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { TEMPO_MODERATO_PATH_USD } from "../shared/domain/tempo";

const modules = import.meta.glob("./**/*.ts");

describe("CVE crowdfunding demo fixture", () => {
  it("creates a fresh open Moderato request for every run", async () => {
    const test = convexTest({ schema, modules });

    const first = await test.mutation(
      internal.demo.prepareCveCrowdfundingDemo,
      { runId: "omp-rehearsal-1" },
    );
    const second = await test.mutation(
      internal.demo.prepareCveCrowdfundingDemo,
      { runId: "omp-rehearsal-2" },
    );

    expect(first.rfsId).not.toBe(second.rfsId);
    expect(first).toMatchObject({
      currentAmountBaseUnits: "0",
      fundingThresholdBaseUnits: "9000",
      minimumContributionBaseUnits: "1000",
      nextState: "open",
    });

    const rows = await test.run((ctx) => ctx.db.query("rfs").collect());
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) =>
          row.status === "open" &&
          row.fundingTokenAddress === TEMPO_MODERATO_PATH_USD &&
          row.currentAmountBaseUnits === BigInt(0),
      ),
    ).toBe(true);
  });

  it("rejects unsafe or ambiguous run identifiers", async () => {
    const test = convexTest({ schema, modules });

    await expect(
      test.mutation(internal.demo.prepareCveCrowdfundingDemo, {
        runId: "../../production",
      }),
    ).rejects.toThrow("runId");
  });
});
