import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("MPP configuration", () => {
  it("fails closed for absent or zero escrow configuration", async () => {
    delete process.env.MPP_RECIPIENT_ESCROW_ADDRESS;
    delete process.env.MPP_FUNDING_TOKEN_ADDRESS;
    delete process.env.MPP_SECRET_KEY;
    const missing = await import("./mpp");
    expect(() => missing.getMppx()).toThrow("MPP_RECIPIENT_ESCROW_ADDRESS");

    vi.resetModules();
    process.env.MPP_RECIPIENT_ESCROW_ADDRESS = "0x0000000000000000000000000000000000000000";
    process.env.MPP_FUNDING_TOKEN_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.MPP_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const zero = await import("./mpp");
    expect(() => zero.getMppx()).toThrow("nonzero");
  });

  it("accepts explicit nonzero addresses and a challenge-binding secret", async () => {
    process.env.MPP_RECIPIENT_ESCROW_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.MPP_FUNDING_TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
    process.env.MPP_SECRET_KEY = "0123456789abcdef0123456789abcdef";
    const configured = await import("./mpp");
    expect(configured.getMppx()).toBeDefined();
  });
});
