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

export const paymentReceiptPayload = (args: {
  intentId: string;
  principalId: string;
  resourceType: string;
  resourceId: string;
  skillVersionId?: string;
  amountBaseUnits: bigint;
  tokenAddress: string;
  network: string;
  contractDigest: string;
  challengeId: string;
  receiptReference: string;
  verifiedAt: number;
}) =>
  JSON.stringify({
    kind: "verified_payment_receipt",
    intentId: args.intentId,
    principalId: args.principalId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    skillVersionId: args.skillVersionId ?? null,
    amountBaseUnits: args.amountBaseUnits.toString(),
    tokenAddress: args.tokenAddress.trim().toLowerCase(),
    network: args.network.trim().toLowerCase(),
    contractDigest: args.contractDigest,
    challengeId: args.challengeId,
    receiptReference: args.receiptReference,
    verifiedAt: args.verifiedAt,
  });

export const paymentIntentChallengePayload = (args: {
  intentId: string;
  principalId: string;
  resourceType: string;
  resourceId: string;
  skillVersionId?: string;
  walletAddress: string;
  amountBaseUnits: bigint;
  tokenAddress: string;
  network: string;
  contractDigest: string;
  expiresAt: number;
}) =>
  JSON.stringify({
    kind: "payment_intent_challenge",
    intentId: args.intentId,
    principalId: args.principalId,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    skillVersionId: args.skillVersionId ?? null,
    walletAddress: args.walletAddress,
    amountBaseUnits: args.amountBaseUnits.toString(),
    tokenAddress: args.tokenAddress.trim().toLowerCase(),
    network: args.network.trim().toLowerCase(),
    contractDigest: args.contractDigest,
    expiresAt: args.expiresAt,
  });

export const evidenceUploadAuthorizationPayload = (args: {
  principalId: string;
  rfsId: string;
  skillVersionId: string;
  criterionId?: string;
  evaluationId?: string;
  mimeType: string;
  expiresAt: number;
}) =>
  JSON.stringify({
    kind: "evidence_upload_authorization",
    principalId: args.principalId,
    rfsId: args.rfsId,
    skillVersionId: args.skillVersionId,
    criterionId: args.criterionId ?? null,
    evaluationId: args.evaluationId ?? null,
    mimeType: args.mimeType.toLowerCase(),
    expiresAt: args.expiresAt,
  });

export const evidenceFinalizePayload = (args: {
  uploadIntentId: string;
  principalId: string;
  storageId: string;
  classification: string;
  restrictionReason?: string;
  plaintextSha256: string;
  ciphertextSha256: string;
  wrappedDataKey: string;
  nonce: string;
  authenticationTag: string;
  kmsKeyVersion: string;
  mimeType: string;
  sizeBytes: number;
  publicRedaction?: string;
  proofManifest: string;
  proofSignature: string;
  signingKeyId: string;
}) =>
  JSON.stringify({
    kind: "evidence_finalize",
    uploadIntentId: args.uploadIntentId,
    principalId: args.principalId,
    storageId: args.storageId,
    classification: args.classification,
    restrictionReason: args.restrictionReason ?? null,
    plaintextSha256: args.plaintextSha256,
    ciphertextSha256: args.ciphertextSha256,
    wrappedDataKey: args.wrappedDataKey,
    nonce: args.nonce,
    authenticationTag: args.authenticationTag,
    kmsKeyVersion: args.kmsKeyVersion,
    mimeType: args.mimeType.toLowerCase(),
    sizeBytes: args.sizeBytes,
    publicRedaction: args.publicRedaction ?? null,
    proofManifest: args.proofManifest,
    proofSignature: args.proofSignature,
    signingKeyId: args.signingKeyId,
  });

export const fixtureFinalizePayload = (args: {
  uploadIntentId: string;
  principalId: string;
  storageId: string;
  bundleSha256: string;
  sizeBytes: number;
  verifiedAt: number;
}) =>
  JSON.stringify({
    kind: "fixture_finalize",
    uploadIntentId: args.uploadIntentId,
    principalId: args.principalId,
    storageId: args.storageId,
    bundleSha256: args.bundleSha256,
    sizeBytes: args.sizeBytes,
    verifiedAt: args.verifiedAt,
  });
