import { describe, expect, it } from "vitest";

import { searchHandoff } from "./handoff";

describe("searchHandoff", () => {
  it("does not advertise the unsupported free-text catalog parameter", () => {
    const handoff = searchHandoff({ q: "cve", tags: ["security"] });

    expect(handoff).toContain("/api/v2/catalog?tag=security");
    expect(handoff).not.toContain("/api/v2/catalog?q=cve");
    expect(handoff).toContain("web-only text filter");
  });
});
