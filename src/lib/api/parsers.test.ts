import { describe, expect, it } from "vitest";

import {
  parseCreateRfsRequest,
  parseFundRequest,
  parseMarketplaceQuery,
  requireIdempotencyKey,
} from "./parsers";

describe("API request parsers", () => {
  it("accepts only explicit string base units at the JSON boundary", async () => {
    const request = new Request("https://oboe.test/api/rfs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Title",
        description: "Description",
        scope: "Scope",
        tags: [" Security ", "security"],
        fundingThresholdBaseUnits: "9000",
        minimumContributionBaseUnits: "1",
      }),
    });
    await expect(parseCreateRfsRequest(request)).resolves.toEqual({
      title: "Title",
      description: "Description",
      scope: "Scope",
      tags: ["security"],
      fundingThresholdBaseUnits: BigInt(9_000),
      minimumContributionBaseUnits: BigInt(1),
    });
  });

  it("parses decimal payment amounts without Number", async () => {
    const request = new Request("https://oboe.test/api/rfs/id/fund", {
      method: "POST",
      body: JSON.stringify({ amount: "0.003" }),
    });
    await expect(parseFundRequest(request)).resolves.toEqual({
      amount: "0.003",
      amountBaseUnits: BigInt(3_000),
    });
  });

  it("normalizes CSV and repeated tag filters identically", () => {
    expect(
      parseMarketplaceQuery("https://oboe.test/api/skills?tags=security,tempo")
        .tags,
    ).toEqual(["security", "tempo"]);
    expect(
      parseMarketplaceQuery(
        "https://oboe.test/api/skills?tags=security&tags=tempo",
      ).tags,
    ).toEqual(["security", "tempo"]);
  });

  it("requires a non-empty idempotency key when a route opts into one", () => {
    expect(() => requireIdempotencyKey(new Headers())).toThrow(
      "Idempotency-Key is required",
    );
    expect(
      requireIdempotencyKey(new Headers({ "Idempotency-Key": " retry-1 " })),
    ).toBe("retry-1");
  });
});
