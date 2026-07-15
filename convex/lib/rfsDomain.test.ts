import { describe, expect, it } from "vitest";

import {
  canClaimRfs,
  canFundRfs,
  canSubmitRfs,
  fundingStateAfterContribution,
} from "./rfsDomain";

describe("RFS lifecycle", () => {
  it("owns every reachable capability", () => {
    expect(canFundRfs("open")).toBe(true);
    expect(canFundRfs("funded")).toBe(false);
    expect(canClaimRfs({ status: "funded" })).toBe(true);
    expect(
      canClaimRfs({ status: "funded", claimantUserId: "claimant" }),
    ).toBe(false);
    expect(
      canSubmitRfs(
        { status: "funded", claimantUserId: "claimant" },
        "claimant",
      ),
    ).toBe(true);
    expect(
      canSubmitRfs(
        { status: "published", claimantUserId: "claimant" },
        "claimant",
      ),
    ).toBe(false);
  });

  it("crosses the funding threshold exactly once", () => {
    expect(fundingStateAfterContribution(BigInt(40), BigInt(59), BigInt(100))).toBe(
      "open",
    );
    expect(fundingStateAfterContribution(BigInt(40), BigInt(60), BigInt(100))).toBe(
      "funded",
    );
  });
});
