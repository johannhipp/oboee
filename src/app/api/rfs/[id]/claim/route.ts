import { api } from "../../../../../../convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import {
  okWrite,
  requireAuthenticatedRoute,
  responseFromError,
} from "@/lib/api/http";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/rfs/[id]/claim">,
) {
  try {
    await requireAuthenticatedRoute();
    const { id } = await context.params;
    const result = await fetchAuthMutation(api.rfs.claim, {
      rfsId: id,
    });
    return okWrite("rfs", result.rfsId, result.nextState);
  } catch (error) {
    return responseFromError(error);
  }
}
