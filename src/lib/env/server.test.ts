import { afterEach, describe, expect, it, vi } from "vitest";

import { readAuthServerConfiguration } from "./server";

describe("auth server configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns origins without trailing slashes for the Better Auth proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://example.convex.site/");

    expect(readAuthServerConfiguration()).toEqual({
      convexUrl: "https://example.convex.cloud",
      convexSiteUrl: "https://example.convex.site",
    });
  });
});
