import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { errorResponseFrom } from "../../_lib/responses";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authed = await isAuthenticated();
    const getDetail = authed ? fetchAuthQuery : fetchQuery;

    try {
      const detail = await getDetail(api.skills.get, {
        skillId: id as Id<"skills">,
      });
      return Response.json(detail);
    } catch {
      const fallbackDetail = await getDetail(api.skills.get, {
        rfsId: id as Id<"rfs">,
      });
      return Response.json(fallbackDetail);
    }
  } catch (error) {
    return errorResponseFrom(error);
  }
}
