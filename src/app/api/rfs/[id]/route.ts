import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom } from "../../_lib/responses";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const { id } = await context.params;
    const result = await fetchAuthQuery(api.rfs.get, {
      rfsId: id as Id<"rfs">,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponseFrom(error);
  }
}
