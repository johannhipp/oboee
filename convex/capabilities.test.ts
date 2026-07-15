import { describe, expect, it } from "vitest";

import { canSubmitRfs } from "./lib/capabilities";

describe("RFS capabilities", () => {
  it("only lets the assigned claimant submit a funded request", () => {
    expect(
      canSubmitRfs(
        { claimantUserId: "claimant", status: "funded" },
        "claimant",
      ),
    ).toBe(true);
    expect(
      canSubmitRfs(
        { claimantUserId: "claimant", status: "funded" },
        "someone-else",
      ),
    ).toBe(false);
    expect(
      canSubmitRfs(
        { claimantUserId: "claimant", status: "open" },
        "claimant",
      ),
    ).toBe(false);
    expect(
      canSubmitRfs(
        { claimantUserId: "claimant", status: "published" },
        "claimant",
      ),
    ).toBe(false);
  });
});
