import { describe, expect, it } from "vitest";

import { statusForCode } from "./responses";

describe("API error status mapping", () => {
  it("maps normalized Convex codes to semantic HTTP statuses", () => {
    expect(statusForCode("unauthorized")).toBe(401);
    expect(statusForCode("FORBIDDEN")).toBe(403);
    expect(statusForCode("reviewer_ineligible")).toBe(403);
    expect(statusForCode("not_found")).toBe(404);
    expect(statusForCode("stale_resource")).toBe(409);
    expect(statusForCode("configuration_error")).toBe(503);
    expect(statusForCode("rate_limited")).toBe(429);
  });
});
