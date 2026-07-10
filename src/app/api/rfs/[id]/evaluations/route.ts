import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "POST", replacementPath: `/api/v2/rfs/${(await context.params).id}/evaluations`, message: "Unbound policy-v1 ratings are retired. Submit criterion results and evidence through v2." });
}
