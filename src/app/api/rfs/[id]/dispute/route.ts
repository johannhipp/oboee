import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom } from "../../../_lib/responses";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason !== "string" || !body.reason.trim()) {
      return errorResponse("INVALID_ARGUMENT", "reason must be a non-empty string.", 400);
    }

    const { id } = await context.params;
    const result = await fetchAuthMutation(api.evaluations.openDispute, {
      rfsId: id as Id<"rfs">,
      reason: body.reason,
    });

    return Response.json({
      status: "ok",
      resourceType: "payoutAssessment",
      resourceId: result.rfsId,
      nextState: result.nextState,
      assessmentStatus: result.assessmentStatus,
    });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
