import { describe, expect, it } from "vitest";

import { API_KEY_DEFAULT_EXPIRES_IN_SECONDS, API_KEY_METADATA_ENABLED } from "./auth";

describe("Better Auth API-key policy", () => {
  it("uses the plugin's seconds-based default expiry for a 90-day key", () => {
    expect(API_KEY_DEFAULT_EXPIRES_IN_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("keeps metadata available for the signed Oboe permission envelope", () => {
    expect(API_KEY_METADATA_ENABLED).toBe(true);
  });
});
