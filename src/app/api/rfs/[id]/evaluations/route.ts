import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom } from "../../../_lib/responses";

const outcomes = ["resolved", "improved", "no_effect", "harmful", "unable_to_apply"] as const;
const confidences = ["low", "medium", "high"] as const;
const evidenceTypes = [
  "test_result",
  "scanner_result",
  "exploit_reproduction",
  "diff_attestation",
  "human_review",
  "freeform",
] as const;
const reviewerTypes = ["agent", "human", "platform_evaluator"] as const;

const isOneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] =>
  typeof value === "string" && allowed.includes(value);

const stringArray = (value: unknown) => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }
  return value;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { id } = await context.params;

    if (
      typeof body.skillId !== "string" ||
      typeof body.skillVersionId !== "string" ||
      typeof body.skillVersion !== "number" ||
      typeof body.contentHash !== "string" ||
      !isOneOf(body.reviewerType, reviewerTypes) ||
      !isOneOf(body.outcome, outcomes) ||
      !isOneOf(body.confidence, confidences) ||
      !isOneOf(body.evidenceType, evidenceTypes) ||
      typeof body.rating !== "number" ||
      typeof body.targetEnvironment !== "string" ||
      typeof body.evidenceSummary !== "string" ||
      typeof body.reviewText !== "string"
    ) {
      return errorResponse("INVALID_ARGUMENT", "Invalid evaluation payload.", 400);
    }

    const vulnerabilityTags = stringArray(body.vulnerabilityTags);
    const evidenceReferences = stringArray(body.evidenceReferences);
    if (!vulnerabilityTags || !evidenceReferences) {
      return errorResponse("INVALID_ARGUMENT", "vulnerabilityTags and evidenceReferences must be string arrays.", 400);
    }

    const agentRuntime =
      body.agentRuntime && typeof body.agentRuntime === "object" && !Array.isArray(body.agentRuntime)
        ? (body.agentRuntime as {
            provider?: string;
            model?: string;
            version?: string;
          })
        : undefined;

    const result = await fetchAuthMutation(api.evaluations.submitEvaluation, {
      rfsId: id as Id<"rfs">,
      skillId: body.skillId as Id<"skills">,
      skillVersionId: body.skillVersionId as Id<"skillVersions">,
      skillVersion: body.skillVersion,
      contentHash: body.contentHash,
      reviewerType: body.reviewerType,
      agentRuntime,
      targetEnvironment: body.targetEnvironment,
      vulnerabilityTags,
      rating: body.rating,
      outcome: body.outcome,
      confidence: body.confidence,
      evidenceType: body.evidenceType,
      evidenceSummary: body.evidenceSummary,
      evidenceReferences,
      reviewText: body.reviewText,
    });

    return Response.json({
      status: "ok",
      resourceType: "evaluation",
      resourceId: result.evaluationEventId,
      nextState: result.nextState,
      assessmentStatus: result.assessmentStatus,
      weightBps: result.weightBps,
    });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
