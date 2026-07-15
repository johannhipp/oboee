import { describe, expect, it } from "vitest";

import { toJsonSafe } from "./json";

describe("JSON boundary", () => {
  it("converts nested bigint values without changing other data", async () => {
    const value = toJsonSafe({
      amount: BigInt(42),
      nested: [{ threshold: BigInt(100), label: "pathUSD" }],
    });
    const response = Response.json(value);

    await expect(response.json()).resolves.toEqual({
      amount: "42",
      nested: [{ threshold: "100", label: "pathUSD" }],
    });
  });
});
