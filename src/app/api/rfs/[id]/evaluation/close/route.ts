import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom } from "../../../../_lib/responses";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { force?: unknown };
    const { id } = await context.params;
    const result = await fetchAuthMutation(api.evaluations.closeEvaluation, {
      rfsId: id as Id<"rfs">,
      force: body.force === true,
    });

    return Response.json({
      status: "ok",
      resourceType: "payoutAssessment",
      resourceId: result.rfsId,
      nextState: result.nextState,
      assessmentStatus: result.assessmentStatus,
      qualityMultiplierBps: result.qualityMultiplierBps,
      finalPayoutBaseUnits: result.finalPayoutBaseUnits.toString(),
      assessmentReason: result.assessmentReason,
    });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
