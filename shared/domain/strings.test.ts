import { describe, expect, it } from "vitest";

import { normalizeEvmAddress, normalizeTags } from "./strings";

describe("domain strings", () => {
  it("normalizes and deduplicates tags in first-seen order", () => {
    expect(normalizeTags([" Security ", "security", "", "Tempo"])).toEqual([
      "security",
      "tempo",
    ]);
  });

  it.each([
    ["0x1111111111111111111111111111111111111111", "0x1111111111111111111111111111111111111111"],
    [" 0xAbCd00000000000000000000000000000000Ef12 ", "0xabcd00000000000000000000000000000000ef12"],
    ["0x0000000000000000000000000000000000000000", null],
    ["0x1234", null],
    ["not-an-address", null],
  ])("normalizes address %s", (input, expected) => {
    expect(normalizeEvmAddress(input)).toBe(expected);
  });
});
