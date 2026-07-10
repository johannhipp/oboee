import { z } from "zod";

export const opaqueIdSchema = z.string().min(1);
export const moneySchema = z.string().regex(/^\d+$/);
export const basisPointsSchema = z.number().int().min(0).max(10_000);
export const isoTimestampSchema = z.string().datetime({ offset: true });

export const capabilitySchema = z.object({
  action: z.string(),
  allowed: z.boolean(),
  method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
  href: z.string(),
  requiredPermission: z.string().optional(),
  idempotencyRequired: z.boolean(),
  humanOnly: z.boolean(),
  resourceVersion: z.number().int().positive().optional(),
  denialCode: z.string().optional(),
  precondition: z.string().optional(),
  expiresAt: isoTimestampSchema.optional(),
});

export type Capability = z.infer<typeof capabilitySchema>;

export const successEnvelopeSchema = <T extends z.ZodType>(data: T) => z.object({
  apiVersion: z.literal("v2"),
  requestId: z.string(),
  data,
  resourceVersion: z.number().int().positive().optional(),
  capabilities: z.array(capabilitySchema),
  links: z.record(z.string(), z.string()),
  operation: z.unknown().optional(),
  page: z.unknown().optional(),
});

export const errorEnvelopeSchema = z.object({
  apiVersion: z.literal("v2"),
  requestId: z.string(),
  code: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requiredPermission: z.string().optional(),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().positive().optional(),
  humanAction: z.unknown().optional(),
  links: z.record(z.string(), z.string()),
});

export const operationSchema = z.object({
  _id: opaqueIdSchema.optional(), command: z.string(), resourceType: z.string(), resourceId: opaqueIdSchema,
  status: z.enum(["pending", "running", "succeeded", "failed", "cancelled"]), progressBps: basisPointsSchema,
  resultResourceId: opaqueIdSchema.optional(), errorCode: z.string().optional(), cancellable: z.boolean(),
  nextPollAt: z.number().int(), eventSequence: z.number().int().positive(), createdAt: z.number().int(), completedAt: z.number().int().optional(),
});

export const activityEventSchema = z.object({
  resourceType: z.string(), resourceId: opaqueIdSchema, eventType: z.string(), publicSummary: z.string(),
  role: z.string(), sequence: z.number().int().positive(), occurredAt: z.number().int(), capabilityReference: z.string().optional(),
});

export const criterionSchema = z.object({
  id: z.string().min(1), title: z.string().min(1),
  passCondition: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("boolean_assertion"), assertion: z.string().min(1) }),
    z.object({ kind: z.literal("numeric_threshold"), metric: z.string().min(1), operator: z.enum(["gte", "lte"]), value: z.string().min(1) }),
    z.object({ kind: z.literal("fixture_assertion"), fixtureVersion: z.string().min(1), assertion: z.string().min(1) }),
  ]),
  verificationMethod: z.string().min(1), weightBps: basisPointsSchema,
  tags: z.array(z.string()), requiredForPublication: z.boolean(),
});

export const rfsDraftSchema = z.object({
  title: z.string().min(1), description: z.string().min(1), scope: z.string().min(1),
  tags: z.array(z.string()).min(1), targetEnvironments: z.array(z.string()).min(1),
  criteria: z.array(criterionSchema).min(1), workEscrowBaseUnits: moneySchema,
  minimumContributionBaseUnits: moneySchema, tokenAddress: z.string(), network: z.string(),
  fundingDurationDays: z.number().int().min(1).max(30).optional(),
  deliveryDurationDays: z.number().int().min(1).max(30).optional(),
  consideredResourceIds: z.array(z.string()), unmetGapReason: z.string().min(1),
});

export const applicationSchema = z.object({
  etaMs: z.number().int().positive(), environment: z.string().min(1),
  criterionPlans: z.array(z.object({ criterionKey: z.string(), executionMethod: z.string(), expectedResult: z.string(), environment: z.string(), evidenceType: z.string(), etaMs: z.number().int().positive() })),
  evidenceMethod: z.string().min(1), relevantWorkReferences: z.array(z.string()), bondAcknowledged: z.boolean(),
});

export const evaluationSchema = z.object({
  skillVersionId: opaqueIdSchema, targetEnvironment: z.string().min(1),
  criterionResults: z.array(z.object({ criterionId: opaqueIdSchema, result: z.enum(["passed", "failed", "not_run"]), artifactIds: z.array(opaqueIdSchema) })),
  narrativeRating: z.number().int().min(1).max(5).optional(), reviewText: z.string(), harmful: z.boolean(),
});

export const postUseReviewSchema = z.object({
  skillVersionId: opaqueIdSchema, rating: z.number().int().min(1).max(5),
  outcome: z.enum(["unable_to_apply", "no_effect", "improved", "resolved", "harmful"]),
  tags: z.array(z.string()), text: z.string().min(1), evidenceArtifactIds: z.array(opaqueIdSchema),
});

export const fixtureUploadIntentSchema = z.object({
  visibility: z.enum(["public", "restricted"]),
  manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bundleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  environmentContract: z.string().min(1),
});

export const fixtureRegistrationSchema = z.object({
  uploadIntentId: opaqueIdSchema,
  storageId: opaqueIdSchema,
});

export const fundingIntentSchema = z.object({ amountBaseUnits: moneySchema });
export const purchaseIntentSchema = z.object({ skillVersionId: opaqueIdSchema });
export const bondIntentSchema = z.object({ applicationId: opaqueIdSchema });
export const evidenceVerificationSchema = z.object({ outcome: z.enum(["verified", "failed"]), reason: z.string().min(1) });
