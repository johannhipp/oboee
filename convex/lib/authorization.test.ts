import { describe, expect, it } from "vitest";

import { baseUnits } from "./policy";
import {
  assertDelegationAuthority,
  consumeDelegatedSpend,
  delegationPermissionsNarrowKey,
  releaseDelegatedSpend,
  reserveDelegatedSpend,
  type DelegationState,
  type MarketplacePermission,
} from "./authorization";

const state = (overrides: Partial<DelegationState> = {}): DelegationState => ({
  status: "active",
  permissions: ["fund", "rfs:read"],
  actions: ["create_funding_intent"],
  resourceAllowlist: ["rfs:one"],
  tagAllowlist: ["security"],
  perTransactionCapBaseUnits: baseUnits(BigInt(100)),
  rolling24HourCapBaseUnits: baseUnits(BigInt(150)),
  lifetimeCapBaseUnits: baseUnits(BigInt(200)),
  reservedBaseUnits: baseUnits(BigInt(0)),
  consumedRollingBaseUnits: baseUnits(BigInt(0)),
  consumedLifetimeBaseUnits: baseUnits(BigInt(0)),
  rollingWindowStartedAt: 1_000,
  tokenAddress: "0xtoken",
  network: "tempo-testnet",
  expiresAt: 100_000,
  ...overrides,
});

const permissionSet = (...values: MarketplacePermission[]) => new Set(values);

describe("delegation authority", () => {
  it("requires both the API key ceiling and narrower delegation scope", () => {
    const delegation = state();
    expect(() =>
      assertDelegationAuthority(delegation, {
        apiKeyPermissions: permissionSet("fund", "rfs:read"),
        requiredPermission: "fund",
        action: "create_funding_intent",
        resourceId: "rfs:one",
        tags: ["security"],
        tokenAddress: "0xtoken",
        network: "tempo-testnet",
        now: 2_000,
      }),
    ).not.toThrow();
    expect(() =>
      assertDelegationAuthority(delegation, {
        apiKeyPermissions: permissionSet("rfs:read"),
        requiredPermission: "fund",
        action: "create_funding_intent",
        now: 2_000,
      }),
    ).toThrow("API key");
    expect(() =>
      assertDelegationAuthority(delegation, {
        apiKeyPermissions: permissionSet("fund"),
        requiredPermission: "fund",
        action: "create_funding_intent",
        resourceId: "rfs:two",
        now: 2_000,
      }),
    ).toThrow("resource");
  });

  it("never permits a delegation to widen its key", () => {
    expect(delegationPermissionsNarrowKey(permissionSet("fund"), ["fund"])).toBe(true);
    expect(delegationPermissionsNarrowKey(permissionSet("fund"), ["fund", "purchase"])).toBe(false);
  });
});

describe("delegated spend", () => {
  it("counts reservations against rolling and lifetime caps", () => {
    const first = reserveDelegatedSpend(state(), baseUnits(BigInt(100)), 2_000);
    expect(first.reservedBaseUnits).toBe(BigInt(100));
    expect(() => reserveDelegatedSpend(first, baseUnits(BigInt(51)), 2_001)).toThrow("rolling");
  });

  it("releases failed intents and consumes only verified spend", () => {
    const reserved = reserveDelegatedSpend(state(), baseUnits(BigInt(80)), 2_000);
    const released = releaseDelegatedSpend(reserved, baseUnits(BigInt(30)));
    const consumed = consumeDelegatedSpend(released, baseUnits(BigInt(50)), 3_000);
    expect(consumed.reservedBaseUnits).toBe(BigInt(0));
    expect(consumed.consumedRollingBaseUnits).toBe(BigInt(50));
    expect(consumed.consumedLifetimeBaseUnits).toBe(BigInt(50));
  });

  it("resets only the rolling window", () => {
    const next = reserveDelegatedSpend(
      state({
        consumedRollingBaseUnits: baseUnits(BigInt(150)),
        consumedLifetimeBaseUnits: baseUnits(BigInt(50)),
      }),
      baseUnits(BigInt(100)),
      1_000 + 24 * 60 * 60 * 1_000,
    );
    expect(next.consumedRollingBaseUnits).toBe(BigInt(0));
    expect(next.consumedLifetimeBaseUnits).toBe(BigInt(50));
    expect(next.reservedBaseUnits).toBe(BigInt(100));
  });
});
