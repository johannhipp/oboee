import { api } from "../../../../../convex/_generated/api";
import { fetchQuery } from "convex/nextjs";

import { errorResponseFrom } from "../../_lib/responses";
import { toJsonSafe } from "@/lib/json";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await fetchQuery(api.rfs.getPublic, { rfsId: id });
    return Response.json(toJsonSafe(result));
  } catch (error) {
    return errorResponseFrom(error);
  }
}
