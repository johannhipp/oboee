import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";

import { errorResponse, errorResponseFrom } from "../../../_lib/responses";

const toJsonSafe = (value: unknown): unknown => {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
    );
  }
  return value;
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return errorResponse("UNAUTHORIZED", "Authentication required.", 401);
  }

  try {
    const { id } = await context.params;
    const result = await fetchAuthQuery(api.evaluations.getForRfs, {
      rfsId: id as Id<"rfs">,
    });

    return Response.json(toJsonSafe(result));
  } catch (error) {
    return errorResponseFrom(error);
  }
}
