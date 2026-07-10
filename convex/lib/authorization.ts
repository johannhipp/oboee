import type { BaseUnits } from "./policy";
import { baseUnitValue, baseUnits } from "./policy";

const DAY_MS = 24 * 60 * 60 * 1_000;

export const MARKETPLACE_PERMISSIONS = [
  "rfs:read",
  "rfs:write",
  "fund",
  "apply",
  "submit",
  "evaluate",
  "purchase",
  "settlement:read",
] as const;

export type MarketplacePermission = (typeof MARKETPLACE_PERMISSIONS)[number];
const MARKETPLACE_PERMISSION_SET: ReadonlySet<string> = new Set(MARKETPLACE_PERMISSIONS);

export const isMarketplacePermission = (value: string): value is MarketplacePermission =>
  MARKETPLACE_PERMISSION_SET.has(value);

export type DelegationState = {
  status: "active" | "revoked" | "expired";
  permissions: readonly MarketplacePermission[];
  actions: readonly string[];
  resourceAllowlist: readonly string[];
  tagAllowlist: readonly string[];
  perTransactionCapBaseUnits?: BaseUnits;
  rolling24HourCapBaseUnits?: BaseUnits;
  lifetimeCapBaseUnits?: BaseUnits;
  reservedBaseUnits: BaseUnits;
  consumedRollingBaseUnits: BaseUnits;
  consumedLifetimeBaseUnits: BaseUnits;
  rollingWindowStartedAt: number;
  tokenAddress?: string;
  network?: string;
  expiresAt?: number;
};

export type DelegationCheck = {
  apiKeyPermissions: ReadonlySet<MarketplacePermission>;
  requiredPermission: MarketplacePermission;
  action: string;
  resourceId?: string;
  tags?: readonly string[];
  tokenAddress?: string;
  network?: string;
  now: number;
};

const includesAll = <T>(allowed: readonly T[], required: readonly T[]) =>
  required.every((value) => allowed.includes(value));

export const assertDelegationAuthority = (
  delegation: DelegationState,
  check: DelegationCheck,
) => {
  if (delegation.status !== "active" || (delegation.expiresAt ?? Infinity) <= check.now) {
    throw new Error("Delegation is not active.");
  }
  if (!check.apiKeyPermissions.has(check.requiredPermission)) {
    throw new Error("The API key does not grant the required permission.");
  }
  if (!delegation.permissions.includes(check.requiredPermission)) {
    throw new Error("The delegation does not grant the required permission.");
  }
  if (!delegation.actions.includes(check.action)) {
    throw new Error("The delegation does not allow this action.");
  }
  if (
    check.resourceId &&
    delegation.resourceAllowlist.length > 0 &&
    !delegation.resourceAllowlist.includes(check.resourceId)
  ) {
    throw new Error("The resource is outside the delegation allowlist.");
  }
  if (check.tags && delegation.tagAllowlist.length > 0 && !includesAll(delegation.tagAllowlist, check.tags)) {
    throw new Error("One or more tags are outside the delegation allowlist.");
  }
  if (delegation.tokenAddress && delegation.tokenAddress !== check.tokenAddress) {
    throw new Error("The token is outside the delegation scope.");
  }
  if (delegation.network && delegation.network !== check.network) {
    throw new Error("The network is outside the delegation scope.");
  }
};

const resetRollingWindow = (delegation: DelegationState, now: number): DelegationState =>
  now - delegation.rollingWindowStartedAt >= DAY_MS
    ? {
        ...delegation,
        consumedRollingBaseUnits: baseUnits(BigInt(0)),
        rollingWindowStartedAt: now,
      }
    : delegation;

export const reserveDelegatedSpend = (
  delegation: DelegationState,
  amount: BaseUnits,
  now: number,
): DelegationState => {
  const normalized = resetRollingWindow(delegation, now);
  const value = baseUnitValue(amount);
  if (value <= BigInt(0)) {
    throw new Error("Reserved spend must be positive.");
  }
  if (
    normalized.perTransactionCapBaseUnits &&
    value > baseUnitValue(normalized.perTransactionCapBaseUnits)
  ) {
    throw new Error("Spend exceeds the per-transaction delegation cap.");
  }
  const nextReserved = baseUnitValue(normalized.reservedBaseUnits) + value;
  if (
    normalized.rolling24HourCapBaseUnits &&
    baseUnitValue(normalized.consumedRollingBaseUnits) + nextReserved >
      baseUnitValue(normalized.rolling24HourCapBaseUnits)
  ) {
    throw new Error("Spend exceeds the rolling delegation cap.");
  }
  if (
    normalized.lifetimeCapBaseUnits &&
    baseUnitValue(normalized.consumedLifetimeBaseUnits) + nextReserved >
      baseUnitValue(normalized.lifetimeCapBaseUnits)
  ) {
    throw new Error("Spend exceeds the lifetime delegation cap.");
  }
  return { ...normalized, reservedBaseUnits: baseUnits(nextReserved) };
};

export const releaseDelegatedSpend = (
  delegation: DelegationState,
  amount: BaseUnits,
): DelegationState => {
  const nextReserved = baseUnitValue(delegation.reservedBaseUnits) - baseUnitValue(amount);
  if (nextReserved < BigInt(0)) {
    throw new Error("Cannot release more spend than is reserved.");
  }
  return { ...delegation, reservedBaseUnits: baseUnits(nextReserved) };
};

export const consumeDelegatedSpend = (
  delegation: DelegationState,
  amount: BaseUnits,
  now: number,
): DelegationState => {
  const normalized = resetRollingWindow(delegation, now);
  const value = baseUnitValue(amount);
  if (value > baseUnitValue(normalized.reservedBaseUnits)) {
    throw new Error("Cannot consume more spend than is reserved.");
  }
  return {
    ...normalized,
    reservedBaseUnits: baseUnits(baseUnitValue(normalized.reservedBaseUnits) - value),
    consumedRollingBaseUnits: baseUnits(baseUnitValue(normalized.consumedRollingBaseUnits) + value),
    consumedLifetimeBaseUnits: baseUnits(baseUnitValue(normalized.consumedLifetimeBaseUnits) + value),
  };
};

export const delegationPermissionsNarrowKey = (
  keyPermissions: ReadonlySet<MarketplacePermission>,
  delegationPermissions: readonly MarketplacePermission[],
) => delegationPermissions.every((permission) => keyPermissions.has(permission));
