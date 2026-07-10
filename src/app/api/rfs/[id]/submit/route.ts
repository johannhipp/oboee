import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "POST", replacementPath: `/api/v2/rfs/${(await context.params).id}/submissions`, message: "Policy-v1 submission is retired. Submit against the selected policy-v2 assignment and frozen contract." });
}
