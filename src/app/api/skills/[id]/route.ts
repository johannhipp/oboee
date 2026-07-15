import { fetchQuery } from "convex/nextjs";

import { api } from "../../../../../convex/_generated/api";
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server";
import { errorResponseFrom } from "../../_lib/responses";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const authed = await isAuthenticated();
    const getDetail = authed ? fetchAuthQuery : fetchQuery;

    const detail = await getDetail(api.skills.get, { skillId: id });
    return Response.json(toJsonSafe(detail));
  } catch (error) {
    return errorResponseFrom(error);
  }
}
