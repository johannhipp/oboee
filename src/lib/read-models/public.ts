import { z } from "zod";

const opaqueId = z.string().min(1);
const marketplaceStatus = z.enum(["open", "funded", "assigned", "submitted", "evaluation_open", "accepted", "revision_requested", "disputed", "rejected", "published", "cancelled", "fulfilled", "draft", "pending", "claimable", "reduced", "blocked", "manually_resolved", "claimed"]);
const maybeDate = z.number().optional();
const iso = (value: number | undefined) => value === undefined ? undefined : new Date(value).toISOString();
const money = (value: bigint | undefined) => value === undefined ? undefined : value.toString();

const publicRfsListItemSchema = z.object({
  rfsId: opaqueId, title: z.string(), description: z.string(), scope: z.string(), tags: z.array(z.string()), status: marketplaceStatus,
  workEscrowBaseUnits: z.bigint().optional(), reviewReserveBaseUnits: z.bigint().optional(), totalFundingTargetBaseUnits: z.bigint().optional(), fundedBaseUnits: z.bigint(),
  fundingDeadline: maybeDate, applicationDeadline: maybeDate, policyVersion: z.number().optional(), riskTier: z.string().optional(), contractDigest: z.string().optional(), resourceVersion: z.number().optional(),
});

export const buildPublicRfsListReadModel = (raw: unknown) => z.array(publicRfsListItemSchema).parse(raw).map((item) => ({
  id: item.rfsId,
  kind: "rfs" as const,
  title: item.title,
  description: item.description,
  scope: item.scope,
  tags: item.tags,
  status: item.status,
  workEscrowBaseUnits: money(item.workEscrowBaseUnits),
  reviewReserveBaseUnits: money(item.reviewReserveBaseUnits),
  totalFundingTargetBaseUnits: money(item.totalFundingTargetBaseUnits),
  fundedBaseUnits: item.fundedBaseUnits.toString(),
  fundingDeadline: iso(item.fundingDeadline),
  applicationDeadline: iso(item.applicationDeadline),
  policyVersion: item.policyVersion,
  riskTier: item.riskTier,
  contractDigest: item.contractDigest,
  resourceVersion: item.resourceVersion,
}));

const catalogSchema = z.object({
  items: z.array(z.object({
    skillId: opaqueId, skillVersionId: opaqueId, title: z.string().optional(), summary: z.string().optional(), category: z.string(), tags: z.array(z.string()), authorHandle: z.string(), qualityBps: z.number(), adoptionBps: z.number(), recencyBps: z.number(), totalBps: z.number(), confidence: z.string(), independentCount: z.number(), quarantineState: z.string(), publishedAt: z.number(), policyVersion: z.number(),
  })),
  nextCursor: z.string().nullable(),
});

export const buildCatalogReadModel = (raw: unknown) => {
  const parsed = catalogSchema.parse(raw);
  return {
    items: parsed.items.map((item) => ({ ...item, id: item.skillId, kind: "skill" as const, publishedAt: iso(item.publishedAt)! })),
    nextCursor: parsed.nextCursor,
  };
};

const publicRfsRawSchema = z.object({
  rfs: z.object({
    rfsId: opaqueId,
    title: z.string(), description: z.string(), scope: z.string(), tags: z.array(z.string()), status: marketplaceStatus,
    policyVersion: z.number().optional(), riskTier: z.string().optional(), authorHandle: z.string(), selectedAuthorHandle: z.string().optional(),
    workEscrowBaseUnits: z.bigint().optional(), reviewReserveBaseUnits: z.bigint().optional(), totalFundingTargetBaseUnits: z.bigint().optional(), fundedBaseUnits: z.bigint(),
    fundingDeadline: maybeDate, applicationDeadline: maybeDate, deliveryDeadline: maybeDate, revisionDeadline: maybeDate,
    contractDigest: z.string().optional(), resourceVersion: z.number().optional(),
  }),
  revision: z.object({
    revisionId: opaqueId, revisionNumber: z.number(), status: z.string(), targetEnvironments: z.array(z.string()), fixtureDigest: z.string().optional(), contractDigest: z.string(), createdAt: z.number(), frozenAt: z.number().optional(),
  }).nullable(),
  criteria: z.array(z.object({
    criterionId: opaqueId, criterionKey: z.string(), title: z.string(), passCondition: z.string(), verificationMethod: z.string(), weightBps: z.number(), requiredForPublication: z.boolean(), tags: z.array(z.string()), fixtureVersionId: opaqueId.optional(),
  })),
  submission: z.object({
    skillId: opaqueId, skillVersionId: opaqueId, version: z.number(), contentHash: z.string(), digestAlgorithm: z.string().optional(), summary: z.string(), quarantineState: z.string(), status: marketplaceStatus, publishedAt: maybeDate,
  }).nullable(),
  assessment: z.object({ status: z.string(), workflowStatus: z.string().optional(), decisionKind: z.string().optional(), passedWeightBps: z.number().optional(), assessmentReason: z.string(), decidedAt: maybeDate }).nullable(),
  publicEvidence: z.array(z.object({ artifactId: opaqueId, criterionId: opaqueId.optional(), classification: z.string(), publicRedaction: z.string().optional(), verificationState: z.string(), scanState: z.string(), mimeType: z.string(), sizeBytes: z.number(), createdAt: z.number() })),
});

export const buildPublicRfsReadModel = (raw: unknown) => {
  const parsed = publicRfsRawSchema.parse(raw);
  return {
    rfs: {
      id: parsed.rfs.rfsId,
      title: parsed.rfs.title,
      description: parsed.rfs.description,
      scope: parsed.rfs.scope,
      tags: parsed.rfs.tags,
      status: parsed.rfs.status,
      policyVersion: parsed.rfs.policyVersion,
      riskTier: parsed.rfs.riskTier,
      authorHandle: parsed.rfs.authorHandle,
      selectedAuthorHandle: parsed.rfs.selectedAuthorHandle,
      workEscrowBaseUnits: money(parsed.rfs.workEscrowBaseUnits),
      reviewReserveBaseUnits: money(parsed.rfs.reviewReserveBaseUnits),
      totalFundingTargetBaseUnits: money(parsed.rfs.totalFundingTargetBaseUnits),
      fundedBaseUnits: parsed.rfs.fundedBaseUnits.toString(),
      fundingDeadline: iso(parsed.rfs.fundingDeadline),
      applicationDeadline: iso(parsed.rfs.applicationDeadline),
      deliveryDeadline: iso(parsed.rfs.deliveryDeadline),
      revisionDeadline: iso(parsed.rfs.revisionDeadline),
      contractDigest: parsed.rfs.contractDigest,
      resourceVersion: parsed.rfs.resourceVersion,
    },
    revision: parsed.revision ? { ...parsed.revision, createdAt: iso(parsed.revision.createdAt)!, frozenAt: iso(parsed.revision.frozenAt) } : null,
    criteria: parsed.criteria,
    submission: parsed.submission ? { ...parsed.submission, publishedAt: iso(parsed.submission.publishedAt) } : null,
    assessment: parsed.assessment ? { ...parsed.assessment, decidedAt: iso(parsed.assessment.decidedAt) } : null,
    publicEvidence: parsed.publicEvidence.map((artifact) => ({ ...artifact, createdAt: iso(artifact.createdAt)! })),
  };
};

const publicSkillRawSchema = z.object({
  skillId: opaqueId, skillVersionId: opaqueId, rfsId: opaqueId, title: z.string(), summary: z.string(), tags: z.array(z.string()), authorHandle: z.string(),
  version: z.number(), contentHash: z.string(), digestAlgorithm: z.string().optional(), purchasePriceBaseUnits: z.bigint(), quarantineState: z.string(), status: marketplaceStatus, publishedAt: maybeDate,
  quality: z.object({ score: z.number(), adjustedScore: z.number(), confidence: z.string(), independentCount: z.number(), computedAt: z.number() }).nullable(),
  uniqueVerifiedInstalls: z.number(),
  reviews: z.array(z.object({ reviewId: opaqueId, rating: z.number(), outcome: z.string(), tags: z.array(z.string()), text: z.string(), state: z.string(), createdAt: z.number() })),
});

export const buildPublicSkillReadModel = (raw: unknown) => {
  const parsed = publicSkillRawSchema.parse(raw);
  return {
    id: parsed.skillId,
    versionId: parsed.skillVersionId,
    rfsId: parsed.rfsId,
    title: parsed.title,
    summary: parsed.summary,
    tags: parsed.tags,
    authorHandle: parsed.authorHandle,
    version: parsed.version,
    contentHash: parsed.contentHash,
    digestAlgorithm: parsed.digestAlgorithm,
    purchasePriceBaseUnits: parsed.purchasePriceBaseUnits.toString(),
    quarantineState: parsed.quarantineState,
    status: parsed.status,
    publishedAt: iso(parsed.publishedAt),
    quality: parsed.quality ? { ...parsed.quality, computedAt: iso(parsed.quality.computedAt)! } : null,
    uniqueVerifiedInstalls: parsed.uniqueVerifiedInstalls,
    reviews: parsed.reviews.map((review) => ({ ...review, createdAt: iso(review.createdAt)! })),
  };
};

export const publicAuthorSchema = z.object({
  handle: z.string(), displayName: z.string(), bio: z.string().optional(), links: z.array(z.string()),
  reputation: z.array(z.object({ tag: z.string(), score: z.number(), adjustedScore: z.number(), confidence: z.string(), independentCount: z.number(), computedAt: z.number(), algorithmVersion: z.number() })),
  sourceSummaries: z.array(z.object({ tag: z.string(), sourceType: z.string(), sourceId: z.string(), finalDecisionId: z.string(), score: z.number(), signalStrengthClass: z.string(), ageDays: z.number(), occurredAt: z.number() })),
  publishedSkills: z.array(z.object({ skillId: opaqueId, rfsId: opaqueId, summary: z.string(), tags: z.array(z.string()), publishedVersionId: opaqueId })),
});

export const buildPublicAuthorReadModel = (raw: unknown) => {
  const parsed = publicAuthorSchema.parse(raw);
  return { ...parsed, reputation: parsed.reputation.map((snapshot) => ({ ...snapshot, computedAt: iso(snapshot.computedAt)! })), sourceSummaries: parsed.sourceSummaries.map((source) => ({ ...source, occurredAt: iso(source.occurredAt)! })) };
};

export const publicReviewSchema = z.object({
  reviewId: opaqueId, skillId: opaqueId, skillVersionId: opaqueId, reviewerHandle: z.string(), rating: z.number(), outcome: z.string(), tags: z.array(z.string()), text: z.string(), state: z.string(), createdAt: z.number(),
  response: z.object({ text: z.string(), createdAt: z.number() }).nullable(),
});

export const buildPublicReviewReadModel = (raw: unknown) => {
  const parsed = publicReviewSchema.parse(raw);
  return { ...parsed, createdAt: iso(parsed.createdAt)!, response: parsed.response ? { ...parsed.response, createdAt: iso(parsed.response.createdAt)! } : null };
};
