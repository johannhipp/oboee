import { api } from "../../../../../../convex/_generated/api";
import { fetchAuthMutation } from "@/lib/auth-server";
import { isMvpPaymentBaseUnits } from "@/lib/tempo";
import {
  okWrite,
  problem,
  requireAuthenticatedRoute,
  responseFromError,
} from "@/lib/api/http";
import { parseSubmitSkillRequest } from "@/lib/api/parsers";

export async function POST(
  request: Request,
  context: RouteContext<"/api/rfs/[id]/submit">,
) {
  try {
    await requireAuthenticatedRoute();
    const body = await parseSubmitSkillRequest(request);
    if (!isMvpPaymentBaseUnits(body.purchasePriceBaseUnits)) {
      return problem(
        "INVALID_ARGUMENT",
        "For MVP testing, purchasePriceBaseUnits must be 1..9000 base units.",
        400,
      );
    }

    const { id } = await context.params;

    const result = await fetchAuthMutation(api.rfs.submit, {
      rfsId: id,
      contentMarkdown: body.contentMarkdown,
      summary: body.summary,
      tags: body.tags,
      purchasePriceBaseUnits: body.purchasePriceBaseUnits,
    });

    return okWrite("rfs", result.rfsId, result.nextState, {
      skillId: result.skillId,
    });
  } catch (error) {
    return responseFromError(error);
  }
}
