import { api } from "../../../../../convex/_generated/api";
import { fetchQuery } from "convex/nextjs";

import { toRfsDetailDto } from "@/lib/api/dto";
import { ok, responseFromError } from "@/lib/api/http";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/rfs/[id]">,
) {
  try {
    const { id } = await context.params;
    const result = await fetchQuery(api.rfs.getPublic, { rfsId: id });
    return ok(toRfsDetailDto(result));
  } catch (error) {
    return responseFromError(error);
  }
}
