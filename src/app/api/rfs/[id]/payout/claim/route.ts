import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom, okWriteResponse } from "../../../../_lib/responses";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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

    const response = okWriteResponse("payout", result.rfsId, result.status);
    const payload = (await response.json()) as Record<string, unknown>;
    return Response.json(
      {
        ...payload,
        claimedAmountBaseUnits: result.claimedAmountBaseUnits.toString(),
      },
      { status: response.status },
    );
  } catch (error) {
    return errorResponseFrom(error);
  }
}
