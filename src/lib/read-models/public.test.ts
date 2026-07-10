import { describe, expect, it } from "vitest";

import { buildPublicRfsReadModel } from "./public";

describe("public read models", () => {
  it("emits wire-safe money and dates without internal principal fields", () => {
    const model = buildPublicRfsReadModel({
      rfs: { rfsId: "rfs-1", title: "Test", description: "Description", scope: "Scope", tags: ["security"], status: "open", authorHandle: "alice", workEscrowBaseUnits: BigInt(100), reviewReserveBaseUnits: BigInt(10), totalFundingTargetBaseUnits: BigInt(110), fundedBaseUnits: BigInt(0), fundingDeadline: 1_800_000_000_000, resourceVersion: 1 },
      revision: null,
      criteria: [],
      submission: null,
      assessment: null,
      publicEvidence: [],
      authorUserId: "must-not-leak",
    });
    expect(model.rfs.workEscrowBaseUnits).toBe("100");
    expect(model.rfs.fundingDeadline).toBe("2027-01-15T08:00:00.000Z");
    expect(JSON.stringify(model)).not.toContain("must-not-leak");
  });
});
