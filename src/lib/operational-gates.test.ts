import { afterEach, describe, expect, it, vi } from "vitest";

import { moneyWritesDisabledResponse, moneyWritesEnabled } from "./operational-gates";

describe("money write operational gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when the flag is absent", async () => {
    vi.stubEnv("OBOE_MONEY_WRITES_ENABLED", "");

    expect(moneyWritesEnabled()).toBe(false);
    const response = moneyWritesDisabledResponse();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      code: "MONEY_WRITES_DISABLED",
    });
  });

  it("opens only for the exact true value", () => {
    vi.stubEnv("OBOE_MONEY_WRITES_ENABLED", "true");

    expect(moneyWritesEnabled()).toBe(true);
    expect(moneyWritesDisabledResponse()).toBeNull();
  });
});
