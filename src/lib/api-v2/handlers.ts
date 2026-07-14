import { createHash } from "node:crypto";

import { anyApi } from "convex/server";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { z } from "zod";

import { fetchPrincipalMutation, fetchPrincipalQuery, type ApiAuthentication } from "@/lib/api-auth";
import { fixtureFinalizePayload } from "../../../shared/authorization-envelope";
import { signServerEnvelope } from "../../../shared/server-envelope";
import { buildPublicAuthorReadModel, buildPublicReviewReadModel, buildPublicRfsReadModel, buildPublicSkillReadModel } from "@/lib/read-models/public";
import { applicationSchema, evaluationSchema, evidenceVerificationSchema, fixtureRegistrationSchema, fixtureUploadIntentSchema, postUseReviewSchema, rfsDraftSchema } from "./schemas/common";
import { applicationCapabilities, assignmentCapabilities, disputeCapabilities, evaluationCapabilities, evidenceCapabilities, humanActionCapabilities, obligationCapabilities, operationCapabilities, reviewAssignmentCapabilities, reviewCapabilities, rfsCapabilities, skillCapabilities } from "./capabilities";
import { v2Authenticated, v2Command, v2Public } from "./route";
import { v2Error, v2Success } from "./responses";

const outcome = (args: { requestId: string; data: unknown; resourceVersion?: number; capabilities?: ReturnType<typeof rfsCapabilities>; links?: Record<string, string>; resourceType?: string; resourceId?: string; status?: number; headers?: HeadersInit }) => {
  const result = { data: args.data, resourceVersion: args.resourceVersion, capabilities: args.capabilities ?? [], links: args.links ?? {} };
  return { response: v2Success({ requestId: args.requestId, data: args.data, resourceVersion: args.resourceVersion, capabilities: args.capabilities, links: args.links, status: args.status, headers: args.headers }), result, resourceType: args.resourceType, resourceId: args.resourceId };
};

const ifMatch = (request: Request) => {
  const raw = request.headers.get("if-match")?.replace(/^W\//, "").replaceAll('"', "");
  const value = raw ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1) throw Object.assign(new Error("State-sensitive command requires an integer If-Match resource version."), { code: "STALE_RESOURCE" });
  return value;
};

export const getCatalog = v2Public(async ({ request, requestId }) => {
  const url = new URL(request.url);
  const result = await fetchQuery(anyApi.reputation.catalog, { category: url.searchParams.get("category") ?? undefined, authorHandle: url.searchParams.get("author") ?? undefined, tags: url.searchParams.getAll("tag"), cursor: url.searchParams.get("cursor") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 20) });
  return v2Success({ requestId, data: result.items.map((item: Record<string, unknown>) => ({ ...item, capabilities: skillCapabilities(String(item.skillId), String(item.skillVersionId), item.quarantineState !== "quarantined", item.policyVersion !== 1) })), capabilities: [], links: { self: request.url }, page: { nextCursor: result.nextCursor } });
});

export const getSkills = getCatalog;

export const getSkill = (skillId: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.skills.getPublic, { skillId });
  if (!result) return v2Error({ requestId, code: "not_found", message: "Skill not found.", status: 404 });
  const versionId = String(result.skillVersionId);
  return v2Success({ requestId, data: buildPublicSkillReadModel(result), capabilities: skillCapabilities(skillId, versionId, result.quarantineState !== "quarantined", result.legacyImported !== true), links: { reviews: `/api/v2/skills/${skillId}/reviews`, installs: `/api/v2/skills/${skillId}/installs`, author: `/authors/${result.authorHandle}` } });
});

export const getSkillVersion = (skillId: string, versionId: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.skills.getVersionMetadata, { skillId, skillVersionId: versionId });
  if (!result) return v2Error({ requestId, code: "not_found", message: "Published skill version not found.", status: 404 });
  return v2Success({ requestId, data: result, capabilities: skillCapabilities(skillId, versionId, result.quarantineState !== "quarantined", result.legacyImported !== true), links: { skill: `/api/v2/skills/${skillId}` } });
});

export const getSkillInstalls = (skillId: string) => v2Public(async ({ requestId }) => v2Success({ requestId, data: await fetchQuery(anyApi.skills.getInstallAggregate, { skillId }), capabilities: [], links: { skill: `/api/v2/skills/${skillId}` } }));

export const getSkillContent = (skillId: string, versionId: string) => v2Authenticated(async ({ requestId, authentication }) => {
  const result = await fetchPrincipalMutation(anyApi.purchases.redeemContent, { skillId, skillVersionId: versionId }, authentication);
  return v2Success({ requestId, data: result, capabilities: [], links: { skill: `/api/v2/skills/${skillId}`, version: `/api/v2/skills/${skillId}/versions/${versionId}` }, headers: { "content-security-policy": "default-src 'none'; sandbox", "x-content-type-options": "nosniff" } });
});

export const getAuthor = (handle: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.reputation.publicAuthor, { handle });
  return result ? v2Success({ requestId, data: buildPublicAuthorReadModel(result), capabilities: [], links: {} }) : v2Error({ requestId, code: "not_found", message: "Author not found.", status: 404 });
});

export const getReview = (reviewId: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.postUseReviews.publicReview, { reviewId });
  return result ? v2Success({ requestId, data: buildPublicReviewReadModel(result), capabilities: reviewCapabilities(String(result.skillId), reviewId, result.state), links: { skill: `/api/v2/skills/${String(result.skillId)}` } }) : v2Error({ requestId, code: "not_found", message: "Review not found.", status: 404 });
});

export const listRfs = v2Public(async ({ request, requestId }) => {
  const url = new URL(request.url);
  const result = await fetchQuery(anyApi.rfsV2.listPublic, { status: url.searchParams.get("status") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 25) });
  return v2Success({ requestId, data: result.map((item: Record<string, unknown>) => ({ ...item, capabilities: rfsCapabilities(String(item.rfsId), String(item.status)) })), capabilities: [], links: { self: request.url } });
});

export const getRfs = (rfsId: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.rfsV2.get, { rfsId });
  if (!result) return v2Error({ requestId, code: "not_found", message: "Policy-v2 RFS not found.", status: 404 });
  return v2Success({ requestId, data: buildPublicRfsReadModel(result), resourceVersion: result.rfs.resourceVersion, capabilities: rfsCapabilities(rfsId, result.rfs.status), links: { revisions: `/api/v2/rfs/${rfsId}/revisions`, events: `/api/v2/rfs/${rfsId}/events`, author: `/authors/${result.rfs.authorHandle}` }, headers: { etag: `"${result.rfs.resourceVersion ?? 1}"` } });
});

const parsedRfs = (input: z.infer<typeof rfsDraftSchema>) => ({ ...input, workEscrowBaseUnits: BigInt(input.workEscrowBaseUnits), minimumContributionBaseUnits: BigInt(input.minimumContributionBaseUnits) });

export const validateRfs = v2Command({ action: "validate_rfs", schema: rfsDraftSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalQuery(anyApi.rfsV2.validateDraft, parsedRfs(input), authentication);
  return outcome({ requestId, data: result, links: { similar: "/api/v2/rfs/similar", create: "/api/v2/rfs" } });
} });

export const similarRfs = v2Command({ action: "similar_rfs", schema: z.object({ title: z.string(), tags: z.array(z.string()), limit: z.number().int().min(1).max(20).optional() }), handler: async ({ requestId, authentication, input }) => outcome({ requestId, data: await fetchPrincipalQuery(anyApi.rfsV2.similar, input, authentication), links: { create: "/api/v2/rfs" } }) });

export const createRfs = v2Command({ action: "create_rfs", schema: rfsDraftSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.rfsV2.create, parsedRfs(input), authentication);
  const id = String(result.rfsId);
  return outcome({ requestId, data: result, resourceVersion: result.resourceVersion, capabilities: rfsCapabilities(id, "open"), links: { self: `/api/v2/rfs/${id}` }, resourceType: "rfs", resourceId: id, status: 201 });
} });

export const reviseRfs = (rfsId: string) => v2Command({ action: `revise_rfs:${rfsId}`, schema: rfsDraftSchema, handler: async ({ request, requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.rfsV2.reviseDraft, { rfsId, expectedResourceVersion: ifMatch(request), ...parsedRfs(input) }, authentication);
  return outcome({ requestId, data: result, resourceVersion: result.resourceVersion, capabilities: rfsCapabilities(rfsId, "open"), links: { self: `/api/v2/rfs/${rfsId}` }, resourceType: "rfsRevision", resourceId: String(result.revisionId) });
} });

export const cancelRfs = (rfsId: string) => v2Command({ action: `cancel_rfs:${rfsId}`, schema: z.object({}), handler: async ({ request, requestId, authentication }) => outcome({ requestId, data: { state: await fetchPrincipalMutation(anyApi.rfsV2.cancelDraft, { rfsId, expectedResourceVersion: ifMatch(request) }, authentication) }, capabilities: rfsCapabilities(rfsId, "cancelled"), links: { self: `/api/v2/rfs/${rfsId}` }, resourceType: "rfs", resourceId: rfsId }) });

export const getRfsRevisions = (rfsId: string) => v2Public(async ({ requestId }) => v2Success({ requestId, data: await fetchQuery(anyApi.rfsV2.listRevisions, { rfsId }), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }));

export const getApplicationEligibility = (rfsId: string) => v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.applications.eligibility, { rfsId }, authentication), capabilities: rfsCapabilities(rfsId, "funded"), links: { applications: `/api/v2/rfs/${rfsId}/applications` } }));

export const listApplications = (rfsId: string) => v2Authenticated(async ({ requestId, authentication }) => { const rows = await fetchPrincipalQuery(anyApi.applications.listForRfs, { rfsId }, authentication); return v2Success({ requestId, data: rows.map((item: Record<string, unknown>) => ({ ...item, capabilities: applicationCapabilities(rfsId, String(item._id), String(item.state), Number(item.resourceVersion), Boolean(item.viewerCanEdit)) })), capabilities: rfsCapabilities(rfsId, "funded"), links: { rfs: `/api/v2/rfs/${rfsId}` } }); });

export const createApplication = (rfsId: string) => v2Command({ action: `create_application:${rfsId}`, schema: applicationSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.applications.create, { rfsId, ...input }, authentication);
  return outcome({ requestId, data: result, resourceVersion: result.resourceVersion, capabilities: applicationCapabilities(rfsId, String(result.applicationId), "active", result.resourceVersion), links: { applications: `/api/v2/rfs/${rfsId}/applications` }, resourceType: "application", resourceId: String(result.applicationId), status: 201 });
} });

export const reviseApplication = (rfsId: string, applicationId: string) => v2Command({ action: `revise_application:${applicationId}`, schema: applicationSchema, handler: async ({ request, requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.applications.revise, { applicationId, expectedResourceVersion: ifMatch(request), ...input }, authentication);
  return outcome({ requestId, data: result, resourceVersion: result.resourceVersion, capabilities: applicationCapabilities(rfsId, applicationId, "active", result.resourceVersion), links: { applications: `/api/v2/rfs/${rfsId}/applications` }, resourceType: "applicationRevision", resourceId: String(result.revisionId) });
} });

export const withdrawApplication = (rfsId: string, applicationId: string) => v2Command({ action: `withdraw_application:${applicationId}`, schema: z.object({}), handler: async ({ request, requestId, authentication }) => outcome({ requestId, data: { state: await fetchPrincipalMutation(anyApi.applications.withdraw, { applicationId, expectedResourceVersion: ifMatch(request) }, authentication) }, links: { applications: `/api/v2/rfs/${rfsId}/applications` }, resourceType: "application", resourceId: applicationId }) });

export const endorseApplication = (rfsId: string, applicationId: string) => v2Command({ action: `endorse_application:${applicationId}`, schema: z.object({ endorsed: z.boolean() }), handler: async ({ requestId, authentication, input }) => outcome({ requestId, data: await fetchPrincipalMutation(anyApi.applications.endorse, { applicationId, endorsed: input.endorsed }, authentication), links: { applications: `/api/v2/rfs/${rfsId}/applications` }, resourceType: "applicationEndorsement", resourceId: applicationId }) });

export const getAssignment = (rfsId: string) => v2Authenticated(async ({ requestId, authentication }) => { const data = await fetchPrincipalQuery(anyApi.applications.getAssignment, { rfsId }, authentication); return v2Success({ requestId, data, capabilities: assignmentCapabilities(rfsId, data ? String(data.applicationId) : undefined, data?.state, Boolean(data?.bondRequired)), links: { rfs: `/api/v2/rfs/${rfsId}` } }); });

const submissionSchema = z.object({ contentMarkdown: z.string().min(1), summary: z.string().min(1), tags: z.array(z.string()).min(1), purchasePriceBaseUnits: z.string().regex(/^\d+$/) });
export const submitSkill = (rfsId: string) => v2Command({ action: `submit_skill:${rfsId}`, schema: submissionSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.submissions.submit, { rfsId, ...input, purchasePriceBaseUnits: BigInt(input.purchasePriceBaseUnits) }, authentication);
  return outcome({ requestId, data: result, links: { workspace: `/api/v2/rfs/${rfsId}/evaluation-workspace` }, resourceType: "skillVersion", resourceId: String(result.skillVersionId), status: 201 });
} });

export const getEvaluationWorkspace = (rfsId: string) => v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.evaluationV2.getWorkspace, { rfsId }, authentication), capabilities: rfsCapabilities(rfsId, "evaluation_open"), links: { evaluations: `/api/v2/rfs/${rfsId}/evaluations`, evidence: `/api/v2/rfs/${rfsId}/evidence` } }));

export const listEvaluations = (rfsId: string) => v2Public(async ({ requestId }) => { const rows = await fetchQuery(anyApi.evaluationV2.listPublic, { rfsId }); return v2Success({ requestId, data: rows.map((item: Record<string, unknown>) => ({ ...item, capabilities: evaluationCapabilities(rfsId, String(item.evaluationId), Boolean(item.active)) })), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }); });

export const createEvaluation = (rfsId: string) => v2Command({ action: `create_evaluation:${rfsId}`, schema: evaluationSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.evaluationV2.submit, { rfsId, ...input }, authentication);
  return outcome({ requestId, data: result, capabilities: evaluationCapabilities(rfsId, String(result.evaluationId), true), links: { evaluations: `/api/v2/rfs/${rfsId}/evaluations` }, resourceType: "evaluation", resourceId: String(result.evaluationId), status: 201 });
} });

export const supersedeEvaluation = (rfsId: string, evaluationId: string) => v2Command({ action: `supersede_evaluation:${evaluationId}`, schema: evaluationSchema.pick({ criterionResults: true, reviewText: true, harmful: true }), handler: async ({ requestId, authentication, input }) => {
  const id = await fetchPrincipalMutation(anyApi.evaluationV2.supersede, { evaluationId, ...input }, authentication);
  return outcome({ requestId, data: { evaluationId: id, supersedesEvaluationId: evaluationId }, links: { evaluations: `/api/v2/rfs/${rfsId}/evaluations` }, resourceType: "evaluation", resourceId: String(id), status: 201 });
} });

export const getEvidence = (rfsId: string) => v2Public(async ({ requestId }) => { const rows = await fetchQuery(anyApi.evidence.listPublicForRfs, { rfsId }); return v2Success({ requestId, data: rows.map((item: Record<string, unknown>) => ({ ...item, capabilities: evidenceCapabilities(rfsId, String(item.artifactId), item.scanState === "clean") })), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }); });

export const listDisputes = (rfsId: string) => v2Authenticated(async ({ requestId, authentication }) => { const rows = await fetchPrincipalQuery(anyApi.evaluationV2.listDisputes, { rfsId }, authentication); return v2Success({ requestId, data: rows.map((item: Record<string, unknown>) => ({ ...item, capabilities: disputeCapabilities(rfsId, String(item._id), String(item.state)) })), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }); });

const disputeEvidenceSchema = z.object({
  evidenceArtifactIds: z.array(z.string().min(1)).min(1),
  rationale: z.string().min(1),
  publicRedaction: z.string().min(1),
});

export const openDispute = (rfsId: string) => v2Command({
  action: `open_dispute:${rfsId}`,
  schema: disputeEvidenceSchema,
  handler: async ({ requestId, authentication, input }) => {
    const disputeId = await fetchPrincipalMutation(anyApi.evaluationV2.openAppeal, { rfsId, ...input }, authentication);
    return outcome({ requestId, data: { disputeId }, capabilities: disputeCapabilities(rfsId, String(disputeId), "open"), links: { disputes: `/api/v2/rfs/${rfsId}/disputes` }, resourceType: "dispute", resourceId: String(disputeId), status: 201 });
  },
});

export const appendDisputeEvidence = (rfsId: string, disputeId: string) => v2Command({
  action: `append_dispute_evidence:${disputeId}`,
  schema: disputeEvidenceSchema,
  handler: async ({ requestId, authentication, input }) => {
    const eventId = await fetchPrincipalMutation(anyApi.evaluationV2.appendDisputeEvidence, { disputeId, ...input }, authentication);
    return outcome({ requestId, data: { eventId }, links: { disputes: `/api/v2/rfs/${rfsId}/disputes` }, resourceType: "disputeEvent", resourceId: String(eventId), status: 201 });
  },
});

export const getRfsEvents = (rfsId: string) => v2Public(async ({ requestId }) => v2Success({ requestId, data: await fetchQuery(anyApi.evaluationV2.listEvents, { rfsId }), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }));

export const getSettlement = (rfsId: string) => v2Public(async ({ requestId }) => v2Success({ requestId, data: await fetchQuery(anyApi.settlements.getRfsSettlement, { rfsId }), capabilities: [], links: { rfs: `/api/v2/rfs/${rfsId}` } }));

export const listSkillReviews = (skillId: string) => v2Public(async ({ requestId }) => { const rows = await fetchQuery(anyApi.postUseReviews.listForSkill, { skillId }); return v2Success({ requestId, data: rows.map((item: Record<string, unknown>) => ({ ...item, capabilities: reviewCapabilities(skillId, String(item.reviewId), String(item.state)) })), capabilities: skillCapabilities(skillId), links: { skill: `/api/v2/skills/${skillId}` } }); });

export const createSkillReview = (skillId: string) => v2Command({ action: `create_post_use_review:${skillId}`, schema: postUseReviewSchema, handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.postUseReviews.create, { skillId, ...input }, authentication);
  return outcome({ requestId, data: result, capabilities: reviewCapabilities(skillId, String(result.reviewId), "pending", true), links: { self: `/api/v2/reviews/${String(result.reviewId)}` }, resourceType: "postUseReview", resourceId: String(result.reviewId), status: 201 });
} });

export const reviseSkillReview = (skillId: string, reviewId: string) => v2Command({ action: `revise_post_use_review:${reviewId}`, schema: postUseReviewSchema.omit({ skillVersionId: true }), handler: async ({ requestId, authentication, input }) => {
  const result = await fetchPrincipalMutation(anyApi.postUseReviews.revise, { reviewId, ...input }, authentication);
  return outcome({ requestId, data: result, links: { review: `/api/v2/reviews/${reviewId}`, skill: `/api/v2/skills/${skillId}` }, resourceType: "postUseReviewRevision", resourceId: String(result.revisionId) });
} });

export const respondSkillReview = (skillId: string, reviewId: string) => v2Command({ action: `respond_post_use_review:${reviewId}`, schema: z.object({ text: z.string().min(1) }), handler: async ({ requestId, authentication, input }) => {
  const id = await fetchPrincipalMutation(anyApi.postUseReviews.respond, { reviewId, text: input.text }, authentication);
  return outcome({ requestId, data: { responseId: id }, links: { review: `/api/v2/reviews/${reviewId}`, skill: `/api/v2/skills/${skillId}` }, resourceType: "postUseReviewResponse", resourceId: String(id), status: 201 });
} });

export const disputeSkillReview = (skillId: string, reviewId: string) => v2Command({ action: `dispute_post_use_review:${reviewId}`, schema: z.object({ evidenceArtifactIds: z.array(z.string()).min(1) }), handler: async ({ requestId, authentication, input }) => outcome({ requestId, data: await fetchPrincipalMutation(anyApi.postUseReviews.dispute, { reviewId, evidenceArtifactIds: input.evidenceArtifactIds }, authentication), links: { review: `/api/v2/reviews/${reviewId}`, skill: `/api/v2/skills/${skillId}` }, resourceType: "postUseReview", resourceId: reviewId }) });

export const listReviewAssignments = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.evaluationV2.listReviewAssignments, {}, authentication), capabilities: [], links: {} }));

export const acceptReviewAssignment = (assignmentId: string, conflictDeclared: boolean) => v2Command({ action: `${conflictDeclared ? "decline" : "accept"}_review_assignment:${assignmentId}`, schema: z.object({}), handler: async ({ requestId, authentication }) => outcome({ requestId, data: await fetchPrincipalMutation(anyApi.evaluationV2.acceptReviewAssignment, { assignmentId, conflictDeclared }, authentication), links: { queue: "/api/v2/review-assignments" }, resourceType: "reviewAssignment", resourceId: assignmentId }) });

export const completeReviewAssignment = (assignmentId: string) => v2Command({ action: `complete_review_assignment:${assignmentId}`, schema: z.object({}), handler: async ({ requestId, authentication }) => outcome({ requestId, data: await fetchPrincipalMutation(anyApi.evaluationV2.completeReviewAssignment, { assignmentId }, authentication), links: { queue: "/api/v2/review-assignments" }, resourceType: "reviewAssignment", resourceId: assignmentId }) });

export const getReviewAssignment = (assignmentId: string) => v2Authenticated(async ({ requestId, authentication }) => {
  const result = await fetchPrincipalQuery(anyApi.evaluationV2.getReviewAssignment, { assignmentId }, authentication);
  return result ? v2Success({ requestId, data: result, capabilities: reviewAssignmentCapabilities(assignmentId, result.assignment.state), links: { queue: "/api/v2/review-assignments" } }) : v2Error({ requestId, code: "not_found", message: "Review assignment not found.", status: 404 });
});

export const verifyReviewEvidence = (assignmentId: string, artifactId: string) => v2Command({
  action: `verify_review_evidence:${artifactId}`,
  schema: evidenceVerificationSchema,
  handler: async ({ requestId, authentication, input }) => outcome({ requestId, data: await fetchPrincipalMutation(anyApi.evidence.verifyAssignedArtifact, { assignmentId, artifactId, ...input }, authentication), links: { assignment: `/api/v2/review-assignments/${assignmentId}` }, resourceType: "evidenceArtifact", resourceId: artifactId }),
});

const humanOnly = (authentication: { method: string }) => {
  if (authentication.method !== "cookie") throw Object.assign(new Error("This privileged command requires an interactive human session and recent passkey authentication."), { code: "FORBIDDEN" });
};

export const listAdjudicationQueue = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.evaluationV2.listAdjudicationQueue, {}, authentication), links: {} }));
export const claimAdjudication = (disputeId: string) => v2Command({ action: `claim_adjudication:${disputeId}`, schema: z.object({}), handler: async ({ requestId, authentication }) => { humanOnly(authentication); return outcome({ requestId, data: await fetchPrincipalMutation(anyApi.evaluationV2.claimDispute, { disputeId }, authentication), links: { queue: "/api/v2/adjudications" }, resourceType: "dispute", resourceId: disputeId }); } });
export const resolveAdjudication = (disputeId: string) => v2Command({
  action: `resolve_adjudication:${disputeId}`,
  schema: z.object({ resolution: z.enum(["clear_hold", "request_revision", "accept_partial", "block_harmful", "reject_fraud", "confirm_abandonment", "insufficient_evidence"]), criterionResults: z.array(z.object({ criterionId: z.string().min(1), result: z.enum(["passed", "failed", "not_run"]) })), rationale: z.string().min(1), publicRedaction: z.string().min(1), conflictDeclared: z.literal(false) }),
  handler: async ({ requestId, authentication, input }) => { humanOnly(authentication); return outcome({ requestId, data: await fetchPrincipalMutation(anyApi.evaluationV2.resolveDispute, { disputeId, ...input }, authentication), links: { queue: "/api/v2/adjudications" }, resourceType: "dispute", resourceId: disputeId }); },
});

export const listReviewModeration = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.postUseReviews.listModerationQueue, {}, authentication), links: {} }));
export const moderateReview = (reviewId: string) => v2Command({ action: `moderate_review:${reviewId}`, schema: z.object({ resolution: z.enum(["uphold", "remove", "clear_harm"]), publicRationale: z.string().min(1) }), handler: async ({ requestId, authentication, input }) => { humanOnly(authentication); return outcome({ requestId, data: await fetchPrincipalMutation(anyApi.postUseReviews.moderate, { reviewId, ...input }, authentication), links: { queue: "/api/v2/review-moderation" }, resourceType: "postUseReview", resourceId: reviewId }); } });

export const getOperatorContext = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.context, {}, authentication), links: { overview: "/api/v2/ops" } }));
export const getOperatorOverview = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.overview, {}, authentication), links: {} }));
export const getOperatorRoles = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.platform.listPlatformRoles, {}, authentication), links: {} }));
export const getOperatorPayments = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.paymentQueue, {}, authentication), links: {} }));
export const getOperatorEvidence = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.evidenceQueue, {}, authentication), links: {} }));
export const getOperatorRecoveries = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.recoveryQueue, {}, authentication), links: {} }));
export const getOperatorIdentity = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.identityQueue, {}, authentication), links: {} }));
export const getOperatorIdentityPreview = v2Authenticated(async ({ request, requestId, authentication }) => { const url = new URL(request.url); return v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.identityOverridePreview, { mode: url.searchParams.get("mode") ?? "split", sourceClusterIds: url.searchParams.getAll("clusterId"), splitPrincipalIds: url.searchParams.getAll("splitPrincipalId") }, authentication), links: { execute: "/api/v2/ops/identity/override" } }); });
export const getOperatorMigrations = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.migrationQueue, {}, authentication), links: {} }));
export const getOperatorAudit = v2Authenticated(async ({ request, requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.operations.auditLog, { limit: Number(new URL(request.url).searchParams.get("limit") ?? 100) }, authentication), links: {} }));

const privilegedCommand = <T>(action: string, schema: z.ZodType<T>, run: (authentication: ApiAuthentication, input: T) => Promise<unknown>, resourceType: string) => v2Command({ action, schema, handler: async ({ requestId, authentication, input }) => { humanOnly(authentication); const data = await run(authentication, input); return outcome({ requestId, data, links: { audit: "/api/v2/ops/audit" }, resourceType, resourceId: action.split(":").at(-1) }); } });

export const grantOperatorRole = privilegedCommand("grant_operator_role", z.object({ principalId: z.string().min(1), role: z.enum(["trusted_reviewer", "security_adjudicator", "security_operator", "platform_operator"]), tags: z.array(z.string()), activeUntil: z.number().int(), reason: z.string().min(1) }), async (authentication, input) => ({ roleId: await fetchPrincipalMutation(anyApi.platform.grantPlatformRole, input, authentication) }), "platformRole");
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const revokeOperatorRole = (roleId: string) => privilegedCommand(`revoke_operator_role:${roleId}`, z.object({ reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => ({ state: await fetchPrincipalMutation(anyApi.platform.revokePlatformRole, { roleId, ...input }, authentication) }), "platformRole");
export const setOperatorFeatureFlag = (key: string) => privilegedCommand(`set_feature_flag:${key}`, z.object({ mode: z.enum(["off", "shadow", "cohort", "on"]), cohortIds: z.array(z.string()), reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.operations.setFeatureFlag, { key, ...input }, authentication), "featureFlag");
export const setOperatorEvidenceHold = (artifactId: string) => privilegedCommand(`set_evidence_hold:${artifactId}`, z.object({ held: z.boolean(), reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.operations.setEvidenceLegalHold, { artifactId, ...input }, authentication), "evidenceArtifact");
export const setOperatorObligationHold = (obligationId: string) => privilegedCommand(`set_obligation_hold:${obligationId}`, z.object({ held: z.boolean(), reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.operations.setObligationHold, { obligationId, ...input }, authentication), "settlementObligation");
export const resolveOperatorMigrationFinding = (findingId: string) => privilegedCommand(`resolve_migration_finding:${findingId}`, z.object({ resolution: z.enum(["resolved", "ignored"]), reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.operations.resolveMigrationFinding, { findingId, ...input }, authentication), "migrationReviewItem");
export const approveOperatorRecovery = (recoveryId: string) => privilegedCommand(`approve_recovery:${recoveryId}`, z.object({ expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.accountRecovery.approveRecovery, { requestId: recoveryId, expectedDigest: input.expectedDigest }, authentication), "accountRecoveryRequest");
export const overrideOperatorIdentity = privilegedCommand("override_identity_clusters", z.object({ mode: z.enum(["merge", "split"]), sourceClusterIds: z.array(z.string().min(1)).min(1), splitPrincipalIds: z.array(z.string().min(1)), overrideExpiresAt: z.number().int(), reason: z.string().min(1), expectedDigest: digestSchema }), async (authentication, input) => await fetchPrincipalMutation(anyApi.operations.overrideIdentityClusters, input, authentication), "identityCluster");

export const getMyWork = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.workspace.myWork, {}, authentication), capabilities: [], links: { activity: "/api/v2/me/activity" } }));
export const getMyActivity = v2Authenticated(async ({ request, requestId, authentication }) => { const url = new URL(request.url); const result = await fetchPrincipalQuery(anyApi.workspace.myActivity, { afterSequence: Number(url.searchParams.get("cursor") ?? 0), limit: Number(url.searchParams.get("limit") ?? 50) }, authentication); return v2Success({ requestId, data: result.items, capabilities: [], links: { self: request.url }, page: { nextCursor: result.nextCursor } }); });
export const getMyObligations = v2Authenticated(async ({ requestId, authentication }) => { const rows = await fetchPrincipalQuery(anyApi.settlements.myObligations, {}, authentication); return v2Success({ requestId, data: rows.map((item: { obligation: Record<string, unknown>; transfer: unknown }) => ({ ...item, capabilities: obligationCapabilities(String(item.obligation.state)) })), capabilities: [], links: { earnings: "/api/v2/me/earnings" } }); });
export const getMyEarnings = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.workspace.myEarnings, {}, authentication), capabilities: [], links: {} }));
export const getMyReputation = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.workspace.myReputation, {}, authentication), capabilities: [], links: {} }));
export const getMyHumanAction = (actionId: string) => v2Authenticated(async ({ requestId, authentication }) => { const data = await fetchPrincipalQuery(anyApi.delegations.getMyHumanAction, { actionId }, authentication); return v2Success({ requestId, data, capabilities: humanActionCapabilities(actionId, data?.status ?? "unavailable"), links: {} }); });
export const getMyDelegations = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.delegations.listMyDelegations, {}, authentication), capabilities: [], links: {} }));
export const getMyWallets = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.principals.listMyWallets, {}, authentication), capabilities: [], links: {} }));

export const createWalletChallenge = v2Command({ action: "create_wallet_challenge", schema: z.object({ address: z.string(), chainId: z.number().int().positive() }), handler: async ({ requestId, authentication, input }) => { const result = await fetchPrincipalMutation(anyApi.principals.createWalletChallenge, input, authentication); return outcome({ requestId, data: result, links: { wallets: "/api/v2/me/wallets" }, resourceType: "walletChallenge", resourceId: String(result.challengeId), status: 201 }); } });
export const confirmWallet = v2Command({ action: "confirm_wallet", schema: z.object({ challengeId: z.string(), message: z.string(), signature: z.string(), makePrimary: z.boolean() }), handler: async ({ requestId, authentication, input }) => { const result = await fetchPrincipalMutation(anyApi.principals.confirmWalletChallenge, input, authentication); return outcome({ requestId, data: result, links: { wallets: "/api/v2/me/wallets" }, resourceType: "wallet", resourceId: String(result.walletId), status: 201 }); } });

const delegationSchema = z.object({
  apiKeyId: z.string().min(1),
  name: z.string().min(1),
  permissions: z.array(z.enum(["rfs:read", "rfs:write", "fund", "apply", "submit", "evaluate", "purchase", "settlement:read"])).min(1),
  actions: z.array(z.string().min(1)).min(1),
  resourceAllowlist: z.array(z.string()),
  tagAllowlist: z.array(z.string()),
  perTransactionCapBaseUnits: z.string().regex(/^\d+$/).optional(),
  rolling24HourCapBaseUnits: z.string().regex(/^\d+$/).optional(),
  lifetimeCapBaseUnits: z.string().regex(/^\d+$/).optional(),
  tokenAddress: z.string().optional(),
  network: z.string().optional(),
  expiresAt: z.number().int().optional(),
});

const parsedDelegation = (input: z.infer<typeof delegationSchema>) => ({
  ...input,
  perTransactionCapBaseUnits: input.perTransactionCapBaseUnits === undefined ? undefined : BigInt(input.perTransactionCapBaseUnits),
  rolling24HourCapBaseUnits: input.rolling24HourCapBaseUnits === undefined ? undefined : BigInt(input.rolling24HourCapBaseUnits),
  lifetimeCapBaseUnits: input.lifetimeCapBaseUnits === undefined ? undefined : BigInt(input.lifetimeCapBaseUnits),
});

export const requestDelegation = v2Command({
  action: "request_delegation",
  schema: delegationSchema,
  handler: async ({ requestId, authentication, input }) => {
    const result = await fetchPrincipalMutation(anyApi.delegations.requestDelegationApproval, parsedDelegation(input), authentication);
    const operationId = await fetchPrincipalMutation(anyApi.apiOperations.createHumanActionOperation, { command: "request_delegation", humanActionId: result.requestId }, authentication);
    return outcome({ requestId, data: { ...result, operationId }, links: { action: `/api/v2/me/human-actions/${String(result.requestId)}`, operation: `/api/v2/operations/${String(operationId)}` }, resourceType: "humanAction", resourceId: String(result.requestId), status: 202, headers: { "retry-after": "5" } });
  },
});

export const getOperation = (operationId: string) => v2Authenticated(async ({ request, requestId, authentication }) => {
  const result = await fetchPrincipalQuery(anyApi.apiOperations.getMine, { operationId }, authentication);
  if (!result) return v2Error({ requestId, code: "not_found", message: "Operation not found.", status: 404 });
  const etag = `"${String(result.eventSequence)}"`;
  const retryAfter = String(Math.max(1, Math.ceil((Number(result.nextPollAt) - Date.now()) / 1_000)));
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "retry-after": retryAfter, "x-request-id": requestId, "cache-control": "no-store" } });
  return v2Success({
    requestId,
    data: result,
    capabilities: operationCapabilities(operationId),
    links: { self: `/api/v2/operations/${operationId}`, resource: `/api/v2/me/human-actions/${String(result.resourceId)}` },
    headers: { etag, "retry-after": retryAfter },
  });
});

export const createFixtureUploadIntent = v2Command({
  action: "create_fixture_upload_intent",
  schema: fixtureUploadIntentSchema,
  handler: async ({ requestId, authentication, input }) => { const result = await fetchPrincipalMutation(anyApi.fixtures.createUploadIntent, input, authentication); return outcome({ requestId, data: result, links: { finalize: "/api/v2/fixtures" }, resourceType: "fixtureUploadIntent", resourceId: String(result.uploadIntentId), status: 201 }); },
});

export const registerFixture = v2Command({
  action: "register_fixture",
  schema: fixtureRegistrationSchema,
  handler: async ({ requestId, authentication, input }) => {
    const prepared = await fetchPrincipalQuery(anyApi.fixtures.prepareRegistration, input, authentication);
    const storageResponse = await fetch(prepared.storageUrl, { cache: "no-store" });
    if (!storageResponse.ok) throw Object.assign(new Error("Stored fixture bytes are unavailable for verification."), { code: "INVALID_FIXTURE" });
    const bytes = new Uint8Array(await storageResponse.arrayBuffer());
    if (bytes.byteLength !== prepared.sizeBytes || bytes.byteLength > 25 * 1024 * 1024) throw Object.assign(new Error("Stored fixture size changed during verification."), { code: "INVALID_FIXTURE" });
    const bundleSha256 = createHash("sha256").update(bytes).digest("hex");
    if (bundleSha256 !== prepared.bundleSha256) throw Object.assign(new Error("Stored fixture bytes do not match the precommitted bundle hash."), { code: "FIXTURE_DIGEST_MISMATCH" });
    const secret = process.env.OBOE_SERVER_ENVELOPE_SECRET?.trim();
    if (!secret || secret.length < 32) throw Object.assign(new Error("Fixture verification signing is not configured."), { code: "CONFIGURATION_ERROR" });
    const verifiedAt = Date.now();
    const verificationSignature = signServerEnvelope(secret, fixtureFinalizePayload({ uploadIntentId: input.uploadIntentId, principalId: prepared.principalId, storageId: input.storageId, bundleSha256, sizeBytes: bytes.byteLength, verifiedAt }));
    const result = await fetchPrincipalMutation(anyApi.fixtures.registerVersion, { ...input, verifiedAt, verificationSignature }, authentication);
    return outcome({ requestId, data: result, links: { fixture: `/api/v2/fixtures/${String(result.fixtureVersionId)}` }, resourceType: "fixtureVersion", resourceId: String(result.fixtureVersionId), status: 201 });
  },
});

export const getFixture = (fixtureVersionId: string) => v2Public(async ({ requestId }) => {
  const result = await fetchQuery(anyApi.fixtures.getMetadata, { fixtureVersionId });
  return result ? v2Success({ requestId, data: result, links: { content: `/api/v2/fixtures/${fixtureVersionId}/content` } }) : v2Error({ requestId, code: "not_found", message: "Fixture version not found.", status: 404 });
});

export const getFixtureContent = (fixtureVersionId: string) => v2Authenticated(async ({ requestId, authentication }) => {
  const result = await fetchPrincipalMutation(anyApi.fixtures.authorizeDownload, { fixtureVersionId }, authentication);
  return result ? v2Success({ requestId, data: result, links: { fixture: `/api/v2/fixtures/${fixtureVersionId}` }, headers: { "cache-control": "no-store", "content-security-policy": "default-src 'none'; sandbox" } }) : v2Error({ requestId, code: "not_found", message: "Fixture content not found.", status: 404 });
});

export const activateDelegation = v2Command({
  action: "activate_delegation",
  schema: delegationSchema.extend({ approvalRequestId: z.string().min(1) }),
  handler: async ({ requestId, authentication, input }) => {
    if (authentication.method !== "api_key") throw Object.assign(new Error("The authorized agent key must activate its own delegation."), { code: "FORBIDDEN" });
    const delegationId = await fetchPrincipalMutation(anyApi.delegations.activateDelegation, { approvalRequestId: input.approvalRequestId, ...parsedDelegation(input) }, authentication);
    return outcome({ requestId, data: { delegationId }, links: { delegations: "/api/v2/me/delegations" }, resourceType: "delegation", resourceId: String(delegationId), status: 201 });
  },
});

export const listSigningKeys = v2Authenticated(async ({ requestId, authentication }) => v2Success({ requestId, data: await fetchPrincipalQuery(anyApi.signingKeys.listMySigningKeys, {}, authentication), links: {} }));
export const createSigningKeyChallenge = v2Command({ action: "create_signing_key_challenge", schema: z.object({ publicKey: z.string().min(1) }), handler: async ({ requestId, authentication, input }) => { const result = await fetchPrincipalMutation(anyApi.signingKeys.createProofKeyChallenge, input, authentication); return outcome({ requestId, data: result, links: { confirm: "/api/v2/me/signing-keys" }, resourceType: "proofKeyChallenge", resourceId: String(result.challengeId), status: 201 }); } });
export const confirmSigningKey = v2Command({ action: "confirm_signing_key", schema: z.object({ challengeId: z.string().min(1), challenge: z.string().min(1), signature: z.string().min(1) }), handler: async ({ requestId, authentication, input }) => { const keyId = await fetchPrincipalMutation(anyApi.signingKeys.confirmProofKeyChallenge, input, authentication); return outcome({ requestId, data: { keyId }, links: { keys: "/api/v2/me/signing-keys" }, resourceType: "signingKey", resourceId: String(keyId), status: 201 }); } });

export const resolveHumanAction = (actionId: string, approved: boolean) => v2Command({
  action: `${approved ? "approve" : "decline"}_human_action:${actionId}`,
  schema: z.object({}),
  handler: async ({ requestId, authentication }) => { humanOnly(authentication); return outcome({ requestId,
    data: { state: await fetchPrincipalMutation(anyApi.delegations.resolveMyHumanAction, { requestId: actionId, approve: approved }, authentication) },
    links: { action: `/api/v2/me/human-actions/${actionId}` },
    resourceType: "humanAction",
    resourceId: actionId,
  }); },
});

export const createRecoveryChallenge = v2Public(async ({ request, requestId }) => {
  if (!request.headers.get("idempotency-key")?.trim()) return v2Error({ requestId, code: "idempotency_key_required", message: "Idempotency-Key is required.", status: 400 });
  const input = z.object({ principalId: z.string().min(1), walletId: z.string().min(1) }).parse(await request.json().catch(() => ({})));
  return v2Success({ requestId, data: await fetchMutation(anyApi.accountRecovery.createRecoveryChallenge, input), status: 201, links: { prove: "/api/v2/recovery/proofs" } });
});

export const proveRecovery = v2Public(async ({ request, requestId }) => {
  if (!request.headers.get("idempotency-key")?.trim()) return v2Error({ requestId, code: "idempotency_key_required", message: "Idempotency-Key is required.", status: 400 });
  const input = z.object({ challengeId: z.string().min(1), challenge: z.string().min(1), signature: z.string().min(1) }).parse(await request.json().catch(() => ({})));
  const result = await fetchMutation(anyApi.accountRecovery.proveRecoveryWallet, input);
  return v2Success({ requestId, data: result, status: 202, links: { status: `/api/v2/recovery/${String(result.requestId)}` }, headers: { "retry-after": "60" } });
});

export const getRecoveryStatus = (recoveryId: string) => v2Public(async ({ request, requestId }) => {
  const statusToken = request.headers.get("recovery-token") ?? "";
  const result = await fetchMutation(anyApi.accountRecovery.getRecoveryStatus, { requestId: recoveryId, statusToken });
  return result ? v2Success({ requestId, data: result, links: { self: `/api/v2/recovery/${recoveryId}` }, headers: { "cache-control": "no-store", "retry-after": "60" } }) : v2Error({ requestId, code: "not_found", message: "Recovery request not found.", status: 404 });
});
