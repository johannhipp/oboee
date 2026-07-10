import { describe, expect, it } from "vitest";

import { jsonResponse, toJsonValue } from "./json";

describe("JSON boundary", () => {
  it("serializes nested bigint values as exact decimal strings", async () => {
    const value = { amount: BigInt("900719925474099300000"), nested: [BigInt(2)] };
    expect(toJsonValue(value)).toEqual({ amount: "900719925474099300000", nested: ["2"] });
    const response = jsonResponse(value);
    await expect(response.json()).resolves.toEqual({
      amount: "900719925474099300000",
      nested: ["2"],
    });
  });
});
