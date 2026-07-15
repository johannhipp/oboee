import { describe, expect, it } from "vitest";

import { readTagParams } from "./api-params";

describe("API query parameters", () => {
  it("normalizes CSV and repeated tag parameters", () => {
    expect(readTagParams(new URLSearchParams("tags=security,tempo"))).toEqual([
      "security",
      "tempo",
    ]);
    expect(readTagParams(new URLSearchParams("tags=security&tags=tempo,mpp"))).toEqual([
      "security",
      "tempo",
      "mpp",
    ]);
    expect(readTagParams(new URLSearchParams())).toBeUndefined();
  });
});
