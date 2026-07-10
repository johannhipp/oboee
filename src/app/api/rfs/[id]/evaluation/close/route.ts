import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "GET", replacementPath: `/api/v2/rfs/${(await context.params).id}/settlement`, message: "Manual policy-v1 evaluation closure is retired. Policy-v2 lifecycle jobs finalize eligible assessments; read settlement state here." });
}
