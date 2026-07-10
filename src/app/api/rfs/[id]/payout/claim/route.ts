import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { moneyWritesDisabledResponse } from "@/lib/operational-gates";

import { errorResponse, errorResponseFrom } from "../../../../_lib/responses";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const disabledResponse = moneyWritesDisabledResponse();
  if (disabledResponse) {
    return disabledResponse;
  }

  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const body = (await request.json()) as { claimGroupId?: unknown };
    if (typeof body.claimGroupId !== "string" || !body.claimGroupId.trim()) {
      return errorResponse("INVALID_ARGUMENT", "claimGroupId must be a non-empty string.", 400);
    }

    const { id } = await context.params;
    const result = await fetchAuthMutation(api.payouts.claimPayout, {
      rfsId: id as Id<"rfs">,
      claimGroupId: body.claimGroupId.trim(),
    });

    return Response.json({
      status: "ok",
      resourceType: "payout",
      resourceId: result.rfsId,
      nextState: result.status,
      claimedAmountBaseUnits: result.claimedAmountBaseUnits.toString(),
      finalPayoutBaseUnits: result.finalPayoutBaseUnits.toString(),
      qualityMultiplierBps: result.qualityMultiplierBps,
      assessmentStatus: result.assessmentStatus,
    });
  } catch (error) {
    return errorResponseFrom(error);
  }
}
