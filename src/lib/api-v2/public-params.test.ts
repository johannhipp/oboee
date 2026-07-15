import { describe, expect, it } from "vitest";

import { isConvexId, parsePublicLimit } from "./public-params";

describe("public API parameter boundaries", () => {
  it("accepts real Convex IDs and rejects malformed resource IDs", () => {
    expect(isConvexId("k171xnt1qhqhgpztssg7e8pb858362jb")).toBe(true);
    expect(isConvexId("not-a-skill-id")).toBe(false);
  });

  it("rejects malformed limits and caps safe large values", () => {
    expect(parsePublicLimit(new Request("https://oboe.test/api/v2/catalog"), 20)).toBe(20);
    expect(parsePublicLimit(new Request("https://oboe.test/api/v2/catalog?limit=1"), 20)).toBe(1);
    expect(parsePublicLimit(new Request("https://oboe.test/api/v2/catalog?limit=999999"), 20)).toBe(100);
    expect(() => parsePublicLimit(new Request("https://oboe.test/api/v2/catalog?limit=abc"), 20)).toThrow("positive integer");
    expect(() => parsePublicLimit(new Request("https://oboe.test/api/v2/catalog?limit=0"), 20)).toThrow("positive integer");
  });
});
