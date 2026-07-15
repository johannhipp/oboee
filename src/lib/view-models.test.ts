import { describe, expect, it } from "vitest";

import { formatTokenAmount } from "./view-models";

describe("token amount formatting", () => {
  it("keeps sub-cent MVP amounts visible without noisy trailing zeros", () => {
    expect(formatTokenAmount(0)).toBe("0.00");
    expect(formatTokenAmount(0.001)).toBe("0.001");
    expect(formatTokenAmount(0.000001)).toBe("0.000001");
    expect(formatTokenAmount(1.5)).toBe("1.50");
  });
});
