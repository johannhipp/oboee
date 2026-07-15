import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom, okWriteResponse } from "../../../_lib/responses";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const { id } = await context.params;
    const result = await fetchAuthMutation(api.rfs.claim, {
      rfsId: id as Id<"rfs">,
    });
    return okWriteResponse("rfs", result.rfsId, result.nextState);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
