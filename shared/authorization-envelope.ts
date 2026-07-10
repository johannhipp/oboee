export const canonicalStringList = (values: readonly string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

export const apiKeyAuthorizationPayload = (args: {
  principalId: string;
  apiKeyId: string;
  permissions: readonly string[];
  issuedAt: number;
}) =>
  JSON.stringify({
    kind: "api_key_authorization",
    principalId: args.principalId,
    apiKeyId: args.apiKeyId,
    permissions: canonicalStringList(args.permissions),
    issuedAt: args.issuedAt,
  });

export const privilegedSessionPayload = (args: {
  principalId: string;
  sessionId: string;
  authenticatedAt: number;
}) =>
  JSON.stringify({
    kind: "privileged_session",
    principalId: args.principalId,
    sessionId: args.sessionId,
    authenticationMethod: "passkey",
    authenticatedAt: args.authenticatedAt,
  });

export const delegationApprovalPayload = (args: {
  principalId: string;
  apiKeyId: string;
  permissions: readonly string[];
  actions: readonly string[];
  resourceAllowlist: readonly string[];
  tagAllowlist: readonly string[];
  perTransactionCapBaseUnits?: bigint;
  rolling24HourCapBaseUnits?: bigint;
  lifetimeCapBaseUnits?: bigint;
  tokenAddress?: string;
  network?: string;
  expiresAt?: number;
}) =>
  JSON.stringify({
    kind: "delegation_approval",
    principalId: args.principalId,
    apiKeyId: args.apiKeyId,
    permissions: canonicalStringList(args.permissions),
    actions: canonicalStringList(args.actions),
    resourceAllowlist: canonicalStringList(args.resourceAllowlist),
    tagAllowlist: canonicalStringList(args.tagAllowlist),
    perTransactionCapBaseUnits: args.perTransactionCapBaseUnits?.toString() ?? null,
    rolling24HourCapBaseUnits: args.rolling24HourCapBaseUnits?.toString() ?? null,
    lifetimeCapBaseUnits: args.lifetimeCapBaseUnits?.toString() ?? null,
    tokenAddress: args.tokenAddress?.trim().toLowerCase() ?? null,
    network: args.network?.trim().toLowerCase() ?? null,
    expiresAt: args.expiresAt ?? null,
  });
