import { retiredApiResponse } from "@/lib/api-v2/legacy-routes";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return retiredApiResponse({ replacementMethod: "POST", replacementPath: `/api/v2/rfs/${(await context.params).id}/applications`, message: "First-claim fulfillment is retired. Submit a scored, evidence-planned application." });
}
