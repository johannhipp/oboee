import { describe, expect, it } from "vitest";

import { resolveNextPath } from "./sign-in-form";

describe("post-auth redirect boundary", () => {
  it("allows local paths and rejects external or ambiguous targets", () => {
    expect(resolveNextPath("/new")).toBe("/new");
    expect(resolveNextPath("/browse/item?q=tempo")).toBe("/browse/item?q=tempo");
    expect(resolveNextPath(null)).toBe("/me");
    expect(resolveNextPath("https://example.com")).toBe("/me");
    expect(resolveNextPath("//example.com/path")).toBe("/me");
    expect(resolveNextPath("/\\example.com/path")).toBe("/me");
  });
});
